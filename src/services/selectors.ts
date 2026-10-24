import type {
  Account,
  Category,
  ExchangeRate,
  Goal,
  Recurring,
  Transaction,
  Valuation,
  TxType,
} from '@/db/db';
import { LIQUID_KINDS, SAVED_KINDS } from '@/db/db';
import { convertMinor, ratesMap } from '@/lib/money';
import { monthEnd, monthKey, monthStart } from '@/lib/dates';

export interface CalcSnapshot {
  accounts: Account[];
  transactions: Transaction[];
  valuations: Valuation[];
  categories: Category[];
  goals: Goal[];
  rates: ExchangeRate[];
  baseCurrency: string;
}

/**
 * Влияние транзакции на баланс счёта.
 * Нормальная транзакция хранится в валюте счёта; если данные «грязные»
 * (валюта транзакции ≠ валюте счёта — импорт, старые записи), конвертируем по курсу.
 */
function txEffectOn(
  tx: Transaction,
  accountId: string,
  accountCurrency: string,
  rates: Record<string, number>,
): number {
  let effect = 0;
  let currency: string;
  if (tx.type === 'income') {
    if (tx.accountId !== accountId) return 0;
    effect = tx.amount;
    currency = tx.currency;
  } else if (tx.type === 'expense') {
    if (tx.accountId !== accountId) return 0;
    effect = -tx.amount;
    currency = tx.currency;
  } else {
    // transfer / savings
    if (tx.accountId === accountId) {
      effect = -tx.amount;
      currency = tx.currency;
    } else if (tx.toAccountId === accountId) {
      if (tx.toAmount != null) {
        effect = tx.toAmount;
        currency = accountCurrency; // toAmount уже в валюте счёта назначения
      } else {
        effect = tx.amount;
        currency = tx.currency;
      }
    } else {
      return 0;
    }
  }
  if (currency !== accountCurrency) {
    return convertMinor(effect, currency, accountCurrency, rates);
  }
  return effect;
}

/**
 * Стоимость счёта на дату.
 * Ликвидные счёта: opening + все транзакции до даты.
 * Активы/обязательства: последняя оценка до даты + транзакции после неё;
 * если оценок нет — opening + все транзакции.
 * Оценка считается на дату включительно.
 */
export function accountValueAt(
  account: Account,
  transactions: Transaction[],
  valuations: Valuation[],
  atISO: string,
  rates?: Record<string, number>,
): number {
  const isLiquid = LIQUID_KINDS.includes(account.kind);
  const safeRates = rates ?? {};
  const myTxs = transactions
    .filter((t) => t.accountId === account.id || t.toAccountId === account.id)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const apply = (fromDate: string | null): number => {
    let sum = 0;
    for (const t of myTxs) {
      if (t.date > atISO) continue;
      if (fromDate && t.date <= fromDate) continue;
      sum += txEffectOn(t, account.id, account.currency, safeRates);
    }
    return sum;
  };

  if (!isLiquid) {
    const relevant = valuations
      .filter((v) => v.accountId === account.id && v.date <= atISO)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    if (relevant.length > 0) {
      const last = relevant[0];
      return last.value + apply(last.date);
    }
  }
  return account.openingBalance + apply(null);
}

export function accountValue(
  account: Account,
  snap: Pick<CalcSnapshot, 'transactions' | 'valuations' | 'rates'>,
): number {
  return accountValueAt(account, snap.transactions, snap.valuations, '9999-12-31', ratesMap(snap.rates));
}

/** Транзакция допустима для счёта-источника? */
export function isLiquid(account: Account): boolean {
  return LIQUID_KINDS.includes(account.kind);
}

export interface AccountWithValue {
  account: Account;
  value: number; // minor, в валюте счёта
  valueBase: number; // minor, в базовой валюте
}

export interface MoneyPosition {
  now: number; // деньги сейчас (ликвидные), base
  saved: number; // отложено (savings + investment), base
  assets: number; // все активы, base
  liabilities: number; // обязательства, base
  netWorth: number; // base
  liquidAccounts: AccountWithValue[];
  savedAccounts: AccountWithValue[];
  assetAccounts: AccountWithValue[];
  liabilityAccounts: AccountWithValue[];
}

export function computePosition(snap: CalcSnapshot): MoneyPosition {
  const rates = ratesMap(snap.rates);
  const base = snap.baseCurrency;
  const active = snap.accounts.filter((a) => !a.archived);

  const withValues: AccountWithValue[] = active.map((a) => {
    const value = accountValueAt(a, snap.transactions, snap.valuations, '9999-12-31', rates);
    return { account: a, value, valueBase: convertMinor(value, a.currency, base, rates) };
  });

  const liquidAccounts = withValues.filter((x) => LIQUID_KINDS.includes(x.account.kind));
  const savedAccounts = withValues.filter((x) => SAVED_KINDS.includes(x.account.kind));
  const assetAccounts = withValues.filter(
    (x) => x.account.kind === 'asset' || x.account.kind === 'crypto',
  );
  const liabilityAccounts = withValues.filter((x) => x.account.kind === 'liability');

  const sum = (list: AccountWithValue[]) => list.reduce((s, x) => s + x.valueBase, 0);

  const now = sum(liquidAccounts);
  const saved = sum(savedAccounts);
  const otherAssets = sum(assetAccounts);
  const liabilities = sum(liabilityAccounts);
  const assets = now + saved + otherAssets;

  return {
    now,
    saved,
    assets,
    liabilities,
    netWorth: assets - liabilities,
    liquidAccounts,
    savedAccounts,
    assetAccounts,
    liabilityAccounts,
  };
}

export interface MonthStats {
  income: number; // base
  expense: number; // base
  savings: number; // base — суммы операций type=savings
  savingsRate: number; // 0..1, может быть <0
  byCategoryExpense: Array<{ category: Category; total: number; share: number }>;
  byCategoryIncome: Array<{ category: Category; total: number; share: number }>;
  transactions: Transaction[];
}

export function monthStats(snap: CalcSnapshot, mKey: string): MonthStats {
  const rates = ratesMap(snap.rates);
  const base = snap.baseCurrency;
  const from = monthStart(mKey);
  const to = monthEnd(mKey);
  const txs = snap.transactions.filter((t) => t.date >= from && t.date <= to);

  const toBase = (t: Transaction) => convertMinor(t.amount, t.currency, base, rates);

  let income = 0;
  let expense = 0;
  let savings = 0;
  for (const t of txs) {
    if (t.type === 'income') income += toBase(t);
    else if (t.type === 'expense') expense += toBase(t);
    else if (t.type === 'savings') savings += toBase(t);
  }

  const catById = new Map(snap.categories.map((c) => [c.id, c]));
  const sumBy = (type: TxType) => {
    const map = new Map<string, number>();
    for (const t of txs) {
      if (t.type !== type || !t.categoryId) continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + toBase(t));
    }
    const totalAll = [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
      .map(([catId, total]) => {
        const category = catById.get(catId) ?? {
          id: catId, name: '—', kind: type === 'income' ? 'income' : 'expense',
          emoji: '❓', keywords: [], sortOrder: 999, isSystem: 0,
        };
        return { category, total, share: totalAll > 0 ? total / totalAll : 0 };
      })
      .sort((a, b) => b.total - a.total);
  };

  return {
    income,
    expense,
    savings,
    savingsRate: income > 0 ? (income - expense) / income : 0,
    byCategoryExpense: sumBy('expense'),
    byCategoryIncome: sumBy('income'),
    transactions: txs,
  };
}

/** История net worth: значение на конец каждого месяца, включая текущий. */
export function netWorthSeries(snap: CalcSnapshot, months: number): Array<{ key: string; value: number }> {
  const rates = ratesMap(snap.rates);
  const base = snap.baseCurrency;
  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const active = snap.accounts.filter((a) => !a.archived);
  return keys.map((key) => {
    const at = monthEnd(key);
    let total = 0;
    for (const a of active) {
      const v = accountValueAt(a, snap.transactions, snap.valuations, at, rates);
      total += convertMinor(v, a.currency, base, rates);
    }
    return { key, value: total };
  });
}

/** Помесячные доходы/расходы за N месяцев (base) */
export function monthlyInOutSeries(
  snap: CalcSnapshot,
  months: number,
): Array<{ key: string; income: number; expense: number; savings: number }> {
  const rates = ratesMap(snap.rates);
  const base = snap.baseCurrency;
  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const byKey = new Map<string, { key: string; income: number; expense: number; savings: number }>();
  for (const key of keys) byKey.set(key, { key, income: 0, expense: 0, savings: 0 });

  for (const t of snap.transactions) {
    const bucket = byKey.get(monthKey(t.date));
    if (!bucket) continue;
    const v = convertMinor(t.amount, t.currency, base, rates);
    if (t.type === 'income') bucket.income += v;
    else if (t.type === 'expense') bucket.expense += v;
    else if (t.type === 'savings') bucket.savings += v;
  }
  return keys.map((k) => byKey.get(k)!);
}

/** Прогресс цели: баланс привязанного счёта или сумма savings-операций с goalId.
 *  Возвращает сумму в валюте цели. */
export function goalProgress(
  goal: Goal,
  snap: CalcSnapshot,
): { amount: number; share: number } {
  const rates = ratesMap(snap.rates);
  let amount = 0;
  if (goal.linkedAccountId) {
    const acc = snap.accounts.find((a) => a.id === goal.linkedAccountId);
    if (acc) {
      const value = Math.max(0, accountValue(acc, snap));
      amount = convertMinor(value, acc.currency, goal.currency, rates);
    }
  } else {
    amount = snap.transactions
      .filter((t) => t.goalId === goal.id)
      .reduce((s, t) => s + convertMinor(t.amount, t.currency, goal.currency, rates), 0);
  }
  return { amount, share: goal.targetAmount > 0 ? Math.min(1, amount / goal.targetAmount) : 0 };
}

/** Счёт по умолчанию для нового расхода/дохода */
export function defaultAccountId(
  accounts: Account[],
  lastAccountId: string | undefined,
  preferLiquid = true,
): string | undefined {
  const active = accounts.filter((a) => !a.archived);
  if (lastAccountId) {
    const last = active.find((a) => a.id === lastAccountId);
    if (last && (!preferLiquid || isLiquid(last))) return last.id;
  }
  return active.find((a) => isLiquid(a))?.id ?? active[0]?.id;
}

/** Повторяющиеся операции, ожидающие проведения (nextDate <= сегодня) */
export function dueRecurring(list: Recurring[], todayISO: string): Recurring[] {
  return list.filter((r) => r.active === 1 && r.nextDate <= todayISO);
}
