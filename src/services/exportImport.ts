import { db } from '@/db/db';
import { toMajor } from '@/lib/money';
import { uid } from '@/lib/utils';

export interface ExportPayload {
  app: 'finassistant';
  schemaVersion: number;
  exportedAt: string;
  data: {
    settings: unknown[];
    accounts: unknown[];
    categories: unknown[];
    transactions: unknown[];
    goals: unknown[];
    purchases: unknown[];
    wishlist: unknown[];
    budgets: unknown[];
    recurring: unknown[];
    notes: unknown[];
    valuations: unknown[];
    exchangeRates: unknown[];
  };
}

export async function exportAllJSON(): Promise<string> {
  const data = {
    settings: await db.settings.toArray(),
    accounts: await db.accounts.toArray(),
    categories: await db.categories.toArray(),
    transactions: await db.transactions.toArray(),
    goals: await db.goals.toArray(),
    purchases: await db.purchases.toArray(),
    wishlist: await db.wishlist.toArray(),
    budgets: await db.budgets.toArray(),
    recurring: await db.recurring.toArray(),
    notes: await db.notes.toArray(),
    valuations: await db.valuations.toArray(),
    exchangeRates: await db.exchangeRates.toArray(),
  };
  const payload: ExportPayload = {
    app: 'finassistant',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportResult {
  transactions: number;
  accounts: number;
  categories: number;
  rest: number;
}

/**
 * Полное восстановление из JSON. Заменяет все данные.
 * Строгая проверка структуры: это данные пользователя, ошибка формата не должна молча портить базу.
 */
export async function importAllJSON(json: string): Promise<ImportResult> {
  const payload = JSON.parse(json) as ExportPayload;
  if (payload?.app !== 'finassistant' || !payload.data || typeof payload.data !== 'object') {
    throw new Error('Файл не является выгрузкой Финансового помощника');
  }
  const d = payload.data;
  const required = ['settings', 'accounts', 'categories', 'transactions', 'exchangeRates'] as const;
  for (const key of required) {
    if (!Array.isArray(d[key])) throw new Error(`В файле нет массива "${key}"`);
  }

  await db.transaction(
    'rw',
    [db.settings, db.accounts, db.categories, db.transactions, db.goals, db.purchases,
      db.wishlist, db.budgets, db.recurring, db.notes, db.valuations, db.exchangeRates],
    async () => {
      await Promise.all([
        db.settings.clear(), db.accounts.clear(), db.categories.clear(), db.transactions.clear(),
        db.goals.clear(), db.purchases.clear(), db.wishlist.clear(), db.budgets.clear(),
        db.recurring.clear(), db.notes.clear(), db.valuations.clear(), db.exchangeRates.clear(),
      ]);
      await db.settings.bulkPut(d.settings as never[]);
      await db.accounts.bulkPut(d.accounts as never[]);
      await db.categories.bulkPut(d.categories as never[]);
      await db.transactions.bulkPut(d.transactions as never[]);
      await db.goals.bulkPut((d.goals ?? []) as never[]);
      await db.purchases.bulkPut((d.purchases ?? []) as never[]);
      await db.wishlist.bulkPut((d.wishlist ?? []) as never[]);
      await db.budgets.bulkPut((d.budgets ?? []) as never[]);
      await db.recurring.bulkPut((d.recurring ?? []) as never[]);
      await db.notes.bulkPut((d.notes ?? []) as never[]);
      await db.valuations.bulkPut((d.valuations ?? []) as never[]);
      await db.exchangeRates.bulkPut(d.exchangeRates as never[]);
    },
  );

  return {
    transactions: d.transactions.length,
    accounts: d.accounts.length,
    categories: d.categories.length,
    rest: (d.goals?.length ?? 0) + (d.purchases?.length ?? 0) + (d.notes?.length ?? 0) +
      (d.recurring?.length ?? 0) + (d.budgets?.length ?? 0) + (d.wishlist?.length ?? 0),
  };
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV транзакций с плоскими понятными колонками (для Excel/Google Sheets). */
export async function exportTransactionsCSV(): Promise<string> {
  const [txs, accounts, categories] = await Promise.all([
    db.transactions.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
  ]);
  const accById = new Map(accounts.map((a) => [a.id, a.name]));
  const catById = new Map(categories.map((c) => [c.id, c.name]));

  const typeLabel: Record<string, string> = {
    income: 'Доход', expense: 'Расход', transfer: 'Перевод', savings: 'Накопление',
  };

  const header = ['Дата', 'Тип', 'Сумма', 'Валюта', 'Категория', 'Счёт', 'Счёт назначения', 'Описание', 'Заметки'];
  const lines = [header.join(';')];
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push([
      t.date,
      typeLabel[t.type] ?? t.type,
      toMajor(t.amount, t.currency),
      t.currency,
      t.categoryId ? catById.get(t.categoryId) ?? '' : '',
      accById.get(t.accountId) ?? '',
      t.toAccountId ? accById.get(t.toAccountId) ?? '' : '',
      t.description ?? '',
      t.notes ?? '',
    ].map(csvEscape).join(';'));
  }
  return '\uFEFF' + lines.join('\n'); // BOM для Excel
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function downloadJSON(content: string): void {
  download(`finassistant-${stamp()}.json`, content, 'application/json');
}

export function downloadCSV(content: string): void {
  download(`transactions-${stamp()}.csv`, content, 'text/csv;charset=utf-8');
}

// ── Демо-данные ──

/** Генерирует 4 месяца правдоподобных операций в существующие счета. Пользователь вызывает осознанно. */
export async function generateDemoData(): Promise<void> {
  const accounts = await db.accounts.filter((a) => !a.archived).toArray();
  const cats = await db.categories.toArray();
  // демо-операции генерируются в UZS — только на счета в UZS
  const liquid = accounts.filter((a) => ['cash', 'card', 'bank', 'ewallet'].includes(a.kind) && a.currency === 'UZS');
  const savingsAcc = accounts.find((a) => a.kind === 'savings');
  if (liquid.length === 0) throw new Error('Нужен хотя бы один счёт в базовой валюте (UZS)');

  const expenseCats = cats.filter((c) => c.kind === 'expense');
  const incomeCats = cats.filter((c) => c.kind === 'income');
  const cat = (name: string) => expenseCats.find((c) => c.name === name) ?? expenseCats[0];
  const incCat = (name: string) => incomeCats.find((c) => c.name === name) ?? incomeCats[0];

  const rnd = (n: number) => Math.floor(Math.random() * n);
  const pick = <T,>(arr: T[]): T => arr[rnd(arr.length)];
  const iso = (monthsAgo: number, day: number) => {
    const d = new Date();
    return `${new Date(d.getFullYear(), d.getMonth() - monthsAgo, Math.min(day, 28)).toISOString().slice(0, 10)}`;
  };
  const now = new Date().toISOString();

  const txs = [];
  for (let m = 3; m >= 0; m--) {
    // зарплата
    const main = liquid[0];
    txs.push({
      id: uid('tx'), type: 'income' as const, amount: 8_500_000 + rnd(600_000), currency: 'UZS',
      accountId: main.id, categoryId: incCat('Зарплата').id, date: iso(m, 5),
      description: 'Зарплата', createdAt: now, updatedAt: now,
    });
    // фриланс в половине месяцев
    if (rnd(2) === 0) {
      txs.push({
        id: uid('tx'), type: 'income' as const, amount: 2_000_000 + rnd(1_500_000), currency: 'UZS',
        accountId: main.id, categoryId: incCat('Фриланс').id, date: iso(m, 12 + rnd(10)),
        description: 'Заказ на фрилансе', createdAt: now, updatedAt: now,
      });
    }
    // аренда
    txs.push({
      id: uid('tx'), type: 'expense' as const, amount: 3_000_000, currency: 'UZS',
      accountId: main.id, categoryId: cat('Жильё').id, date: iso(m, 3),
      description: 'Аренда квартиры', createdAt: now, updatedAt: now,
    });
    // связь
    txs.push({
      id: uid('tx'), type: 'expense' as const, amount: 55_000, currency: 'UZS',
      accountId: main.id, categoryId: cat('Связь').id, date: iso(m, 7),
      description: 'Мобильный интернет', createdAt: now, updatedAt: now,
    });
    // подписка
    txs.push({
      id: uid('tx'), type: 'expense' as const, amount: 79_000, currency: 'UZS',
      accountId: main.id, categoryId: cat('Подписки').id, date: iso(m, 9),
      description: 'Подписка на музыку', createdAt: now, updatedAt: now,
    });
    // еда — 10-18 раз за месяц
    const foodCount = 10 + rnd(8) + (m === 0 ? 6 : 0); // в текущем месяце больше
    for (let i = 0; i < foodCount; i++) {
      txs.push({
        id: uid('tx'), type: 'expense' as const, amount: (15 + rnd(120)) * 1000, currency: 'UZS',
        accountId: pick(liquid).id, categoryId: cat('Еда').id, date: iso(m, 1 + rnd(28)),
        description: pick(['Кофе', 'Обед', 'Продукты', 'Самса', 'Доставка']),
        createdAt: now, updatedAt: now,
      });
    }
    // транспорт
    for (let i = 0; i < 5 + rnd(5); i++) {
      txs.push({
        id: uid('tx'), type: 'expense' as const, amount: (12 + rnd(50)) * 1000, currency: 'UZS',
        accountId: pick(liquid).id, categoryId: cat('Транспорт').id, date: iso(m, 1 + rnd(28)),
        description: pick(['Такси', 'Метро', 'Автобус']),
        createdAt: now, updatedAt: now,
      });
    }
    // развлечения/техника/одежда/здоровье — изредка
    const misc: Array<[string, number, number, string]> = [
      ['Развлечения', 40, 300, 'Кино / игры'],
      ['Техника', 150, 2000, 'Гаджеты'],
      ['Одежда', 150, 800, 'Одежда'],
      ['Здоровье', 30, 400, 'Аптека'],
    ];
    for (const [catName, lo, hi, desc] of misc) {
      if (rnd(2) === 0) {
        txs.push({
          id: uid('tx'), type: 'expense' as const, amount: (lo + rnd(hi - lo)) * 1000, currency: 'UZS',
          accountId: pick(liquid).id, categoryId: cat(catName).id, date: iso(m, 1 + rnd(28)),
          description: desc, createdAt: now, updatedAt: now,
        });
      }
    }
    // накопления
    if (savingsAcc) {
      txs.push({
        id: uid('tx'), type: 'savings' as const, amount: (500 + rnd(700)) * 1000, currency: 'UZS',
        accountId: main.id, toAccountId: savingsAcc.id, date: iso(m, 20 + rnd(5)),
        description: 'Отложил с зарплаты', createdAt: now, updatedAt: now,
      });
    }
  }

  await db.transactions.bulkAdd(txs);
}
