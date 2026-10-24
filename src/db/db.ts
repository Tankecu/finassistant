import Dexie, { type Table } from 'dexie';
import { seedDatabase } from './seed';

export type TxType = 'income' | 'expense' | 'transfer' | 'savings';

export type AccountKind =
  | 'cash'
  | 'card'
  | 'bank'
  | 'ewallet'
  | 'savings'
  | 'investment'
  | 'crypto'
  | 'asset'
  | 'liability';

export const LIQUID_KINDS: AccountKind[] = ['cash', 'card', 'bank', 'ewallet'];
export const SAVED_KINDS: AccountKind[] = ['savings', 'investment'];

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: 'Наличные',
  card: 'Карта',
  bank: 'Банковский счёт',
  ewallet: 'Электронный кошелёк',
  savings: 'Накопления',
  investment: 'Инвестиции',
  crypto: 'Криптовалюта',
  asset: 'Другой актив',
  liability: 'Обязательство',
};

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  /** Начальный баланс на момент создания счёта (minor units). Для liability — сумма долга. */
  openingBalance: number;
  color?: string;
  notes?: string;
  archived: 0 | 1;
  sortOrder: number;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  emoji: string;
  color?: string;
  /** Ключевые слова для распознавания в быстром вводе */
  keywords: string[];
  sortOrder: number;
  isSystem: 0 | 1;
}

export interface Transaction {
  id: string;
  type: TxType;
  /** Всегда положительное число (minor units) в валюте счёта accountId */
  amount: number;
  currency: string;
  accountId: string;
  /** Для transfer / savings — счёт назначения */
  toAccountId?: string;
  /** Сумма зачисления в валюте toAccountId (если отличается от валюты списания) */
  toAmount?: number;
  categoryId?: string;
  date: string; // YYYY-MM-DD
  description?: string;
  notes?: string;
  goalId?: string;
  purchaseId?: string;
  recurringId?: string;
  /** Связанная операция: например, расход-комиссия для перевода обмена валют */
  relatedId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number; // minor
  currency: string;
  deadline?: string; // YYYY-MM-DD
  linkedAccountId?: string;
  status: 'active' | 'done' | 'archived';
  note?: string;
  createdAt: string;
}

export interface Purchase {
  id: string;
  transactionId?: string;
  name: string;
  amount: number; // minor
  currency: string;
  date: string;
  categoryId?: string;
  why?: string;
  got?: string;
  pros?: string;
  cons?: string;
  worthIt?: 'yes' | 'no' | 'unknown';
  rating?: number; // 1..10
  createdAt: string;
}

export type WishlistStatus = 'want' | 'planned' | 'saving' | 'bought' | 'cancelled';

export interface WishlistItem {
  id: string;
  name: string;
  targetAmount: number; // minor
  currency: string;
  priority: 'high' | 'medium' | 'low';
  why?: string;
  status: WishlistStatus;
  createdAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  /** Месячный лимит в базовой валюте (minor) */
  amount: number;
  createdAt: string;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurring {
  id: string;
  name: string;
  type: 'income' | 'expense';
  amount: number; // minor
  currency: string;
  categoryId?: string;
  accountId: string;
  frequency: RecurringFrequency;
  interval: number;
  nextDate: string;
  active: 0 | 1;
  /** Автоматически создавать транзакции при открытии приложения */
  autoCreate: 0 | 1;
  note?: string;
  createdAt: string;
}

export type NoteLinkType = 'none' | 'transaction' | 'purchase' | 'category' | 'goal' | 'date';

export interface Note {
  id: string;
  text: string;
  linkType: NoteLinkType;
  linkId?: string;
  linkDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Valuation {
  id: string;
  accountId: string;
  date: string;
  /** Стоимость в валюте счёта (minor) */
  value: number;
  note?: string;
  createdAt: string;
}

export interface ExchangeRate {
  code: string;
  /** 1 единица валюты = rate единиц базовой валюты */
  rate: number;
  manual: 0 | 1;
  updatedAt: string;
}

export interface SettingsRec {
  id: 'app';
  baseCurrency: string;
  onboarded: 0 | 1;
  /** Последний счёт, использованный в операции — дефолт для быстрого ввода */
  lastAccountId?: string;
  autoCreateRecurring: 0 | 1;
  voiceLocale: string;
  createdAt: string;
}

export const SCHEMA_VERSION = 2;

export class FinDB extends Dexie {
  settings!: Table<SettingsRec, string>;
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  goals!: Table<Goal, string>;
  purchases!: Table<Purchase, string>;
  wishlist!: Table<WishlistItem, string>;
  budgets!: Table<Budget, string>;
  recurring!: Table<Recurring, string>;
  notes!: Table<Note, string>;
  valuations!: Table<Valuation, string>;
  exchangeRates!: Table<ExchangeRate, string>;

  constructor() {
    super('finassistant');
    this.version(SCHEMA_VERSION).stores({
      settings: 'id',
      accounts: 'id, kind, currency, sortOrder, archived',
      categories: 'id, kind, sortOrder',
      transactions: 'id, date, type, accountId, toAccountId, categoryId, goalId, purchaseId, recurringId, relatedId',
      goals: 'id, status',
      purchases: 'id, transactionId, date',
      wishlist: 'id, status',
      budgets: 'id, categoryId',
      recurring: 'id, nextDate, active',
      notes: 'id, linkType, createdAt',
      valuations: 'id, accountId, date',
      exchangeRates: 'code',
    });

    // Populate выполняется один раз — при первом создании базы
    this.on('populate', () => {
      void seedDatabase();
    });
  }
}

export const db = new FinDB();
