import { db, type Transaction, type TxType } from '@/db/db';
import { uid } from '@/lib/utils';
import { convertMinor, formatMoney, ratesMap } from '@/lib/money';

export interface TxInput {
  type: TxType;
  amount: number;
  currency: string;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  date: string;
  description?: string;
  notes?: string;
  goalId?: string;
  purchaseId?: string;
  recurringId?: string;
  /** Для transfer: сколько реально пришло на счёт назначения (minor, в валюте to-счёта).
   *  Если меньше расчётного по курсу — разница пишется расходом «Комиссия обмена». */
  receivedAmount?: number;
}

export interface SaveResult {
  id: string;
  /** Сообщение о конвертации валюты, если она случилась */
  convertedNote?: string;
  /** Сообщение о комиссии обмена, если она учтена */
  commissionNote?: string;
  commissionTxId?: string;
}

/**
 * Транзакция всегда хранится в валюте счёта.
 * Если пользователь ввёл сумму в другой валюте — конвертируем по текущему курсу.
 * Для transfer/savings между счетами в разных валютах пишем toAmount.
 *
 * Комиссия обмена: пользователь сказал, сколько реально получил. Разница между
 * «справедливым» зачислением по курсу и фактом — это расход в валюте источника.
 * Перевод при этом остаётся нейтральным к капиталу, комиссия видна в аналитике.
 */
export async function saveTransaction(input: TxInput, existingId?: string): Promise<SaveResult> {
  const existing = existingId ? await db.transactions.get(existingId) : undefined;
  const rates = ratesMap(await db.exchangeRates.toArray());

  const account = await db.accounts.get(input.accountId);
  const accountCurrency = account?.currency ?? input.currency;
  let amount = Math.max(0, Math.round(input.amount));
  let currency = input.currency;
  let convertedNote: string | undefined;

  if (currency !== accountCurrency) {
    const converted = convertMinor(amount, currency, accountCurrency, rates);
    convertedNote = `${formatShort(amount, currency)} → ${formatShort(converted, accountCurrency)}`;
    amount = converted;
    currency = accountCurrency;
  }

  const isMove = input.type === 'transfer' || input.type === 'savings';
  const toAccount = isMove && input.toAccountId ? await db.accounts.get(input.toAccountId) : undefined;
  const toCurrency = toAccount?.currency;

  let toAmount: number | undefined;
  let commission: number | null = null;
  if (toAccount && toCurrency) {
    if (toCurrency !== currency) {
      toAmount = convertMinor(amount, currency, toCurrency, rates);
    }
    // комиссия обмена — только для переводов
    if (input.type === 'transfer' && input.receivedAmount != null && input.receivedAmount > 0) {
      const expected = toAmount ?? amount; // ожидаемое зачисление в валюте to-счёта
      const received = Math.round(input.receivedAmount);
      if (received < expected) {
        // сколько источника «стоит» фактическое получение
        const fairSource = convertMinor(received, toCurrency, currency, rates);
        commission = amount - fairSource;
        if (commission > 0) {
          // списываем ровно столько, сколько соответствует факту получения
          amount = fairSource;
          toAmount = toCurrency !== currency ? received : undefined;
          if (toCurrency === currency) amount = received;
        }
      } else if (received > expected && toCurrency !== currency) {
        // обмен выгоднее курса: зачисляем факт, нетворс растёт на разницу
        toAmount = received;
      }
    }
  }

  const tx: Transaction = {
    id: existing?.id ?? uid('tx'),
    type: input.type,
    amount,
    currency,
    accountId: input.accountId,
    toAccountId: isMove ? input.toAccountId : undefined,
    toAmount,
    categoryId: input.type === 'income' || input.type === 'expense' ? input.categoryId : undefined,
    date: input.date,
    description: input.description?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    goalId: input.type === 'savings' ? input.goalId : undefined,
    purchaseId: input.purchaseId ?? existing?.purchaseId,
    recurringId: input.recurringId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let commissionTxId: string | undefined;
  let commissionNote: string | undefined;
  if (commission !== null && commission > 0) {
    const catId = await ensureExchangeCategoryId();
    commissionTxId = uid('tx');
    const commissionTx: Transaction = {
      id: commissionTxId,
      type: 'expense',
      amount: commission,
      currency,
      accountId: input.accountId,
      categoryId: catId,
      date: input.date,
      description: 'Комиссия обмена',
      relatedId: tx.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.transactions.bulkPut([tx, commissionTx]);
    commissionNote = `комиссия ${formatMoney(commission, currency, { compact: true })}`;
  } else {
    await db.transactions.put(tx);
  }

  await db.settings.update('app', { lastAccountId: tx.accountId });
  return { id: tx.id, convertedNote, commissionNote, commissionTxId };
}

/** Категория «Обмен валют» для комиссий — создаётся при первом использовании. */
async function ensureExchangeCategoryId(): Promise<string> {
  const existing = await db.categories
    .where('kind')
    .equals('expense')
    .filter((c) => c.name === 'Обмен валют')
    .first();
  if (existing) return existing.id;
  const id = uid('cat');
  await db.categories.put({
    id,
    name: 'Обмен валют',
    kind: 'expense',
    emoji: '💱',
    color: '#fbbf24',
    keywords: ['комиссия', 'обмен', 'обменник', 'обменял'],
    sortOrder: 90,
    isSystem: 1,
  });
  return id;
}

function formatShort(minor: number, code: string): string {
  return formatMoney(minor, code, { compact: true });
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.purchases, async () => {
    await db.transactions.delete(id);
    // удаляем связанную комиссию, если есть
    const related = await db.transactions.where('relatedId').equals(id).toArray();
    await db.transactions.bulkDelete(related.map((t) => t.id));
    // отвязываем покупку, если была привязана
    const purchase = await db.purchases.where('transactionId').equals(id).first();
    if (purchase) {
      await db.purchases.update(purchase.id, { transactionId: undefined });
    }
  });
}

export async function duplicateTransaction(id: string): Promise<void> {
  const tx = await db.transactions.get(id);
  if (!tx) return;
  const copy: Transaction = {
    ...tx,
    id: uid('tx'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    purchaseId: undefined,
    recurringId: undefined,
  };
  await db.transactions.put(copy);
}
