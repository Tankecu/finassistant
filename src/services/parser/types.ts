import type { TxType } from '@/db/db';

export interface ParserContext {
  baseCurrency: string;
  categories: Array<{ id: string; name: string; kind: 'income' | 'expense'; keywords: string[]; sortOrder: number }>;
  accounts: Array<{ id: string; name: string; kind: string; currency: string }>;
  goals: Array<{ id: string; name: string; linkedAccountId?: string }>;
  lastAccountId?: string;
  today: string;
}

export interface ParsedOp {
  type: TxType | null;
  amountMajor: number | null;
  currency: string | null;
  categoryId: string | null;
  accountId: string | null;
  toAccountId: string | null;
  goalId: string | null;
  date: string;
  purchaseName: string | null;
  description: string;
  /** Чего не хватает для сохранения без вопросов */
  missing: Array<'amount' | 'type'>;
}

export interface AmountMatch {
  major: number;
  currency: string | null;
  start: number;
  end: number;
}
