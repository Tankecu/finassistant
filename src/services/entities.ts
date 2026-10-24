import { db, type Goal, type Purchase, type WishlistItem, type Recurring, type Note, type ExchangeRate, type Category } from '@/db/db';
import { uid } from '@/lib/utils';
import { addDays, addMonths, addYears, todayISO } from '@/lib/dates';

// ── Цели ──

export interface GoalInput {
  name: string;
  targetAmount: number;
  currency: string;
  deadline?: string;
  linkedAccountId?: string;
  note?: string;
}

export async function createGoal(input: GoalInput): Promise<string> {
  const id = uid('goal');
  await db.goals.put({
    id,
    name: input.name.trim(),
    targetAmount: input.targetAmount,
    currency: input.currency,
    deadline: input.deadline,
    linkedAccountId: input.linkedAccountId,
    status: 'active',
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function updateGoal(id: string, patch: Partial<GoalInput> & { status?: Goal['status'] }): Promise<void> {
  await db.goals.update(id, patch);
}

export async function deleteGoal(id: string): Promise<void> {
  await db.transaction('rw', db.goals, db.transactions, db.notes, async () => {
    const txs = await db.transactions.where('goalId').equals(id).toArray();
    for (const t of txs) await db.transactions.update(t.id, { goalId: undefined });
    await db.goals.delete(id);
  });
}

// ── Покупки ──

export interface PurchaseInput {
  name: string;
  amount: number;
  currency: string;
  date: string;
  categoryId?: string;
  why?: string;
  got?: string;
  pros?: string;
  cons?: string;
  worthIt?: Purchase['worthIt'];
  rating?: number;
  transactionId?: string;
}

export async function createPurchase(input: PurchaseInput): Promise<string> {
  const id = uid('buy');
  await db.purchases.put({
    id,
    name: input.name.trim(),
    amount: input.amount,
    currency: input.currency,
    date: input.date,
    categoryId: input.categoryId,
    why: input.why?.trim() || undefined,
    got: input.got?.trim() || undefined,
    pros: input.pros?.trim() || undefined,
    cons: input.cons?.trim() || undefined,
    worthIt: input.worthIt ?? 'unknown',
    rating: input.rating,
    transactionId: input.transactionId,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function updatePurchase(id: string, patch: Partial<PurchaseInput>): Promise<void> {
  await db.purchases.update(id, patch);
}

export async function deletePurchase(id: string): Promise<void> {
  await db.transaction('rw', db.purchases, db.transactions, async () => {
    const txs = await db.transactions.where('purchaseId').equals(id).toArray();
    for (const t of txs) await db.transactions.update(t.id, { purchaseId: undefined });
    await db.purchases.delete(id);
  });
}

// ── Вишлист ──

export interface WishlistInput {
  name: string;
  targetAmount: number;
  currency: string;
  priority: WishlistItem['priority'];
  why?: string;
  status: WishlistItem['status'];
}

export async function createWishlistItem(input: WishlistInput): Promise<string> {
  const id = uid('wish');
  await db.wishlist.put({
    id,
    name: input.name.trim(),
    targetAmount: input.targetAmount,
    currency: input.currency,
    priority: input.priority,
    why: input.why?.trim() || undefined,
    status: input.status,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function updateWishlistItem(id: string, patch: Partial<WishlistInput>): Promise<void> {
  await db.wishlist.update(id, patch);
}

export async function deleteWishlistItem(id: string): Promise<void> {
  await db.wishlist.delete(id);
}

// ── Бюджеты ──

export async function setBudget(categoryId: string, amount: number): Promise<void> {
  const existing = await db.budgets.where('categoryId').equals(categoryId).first();
  if (existing) {
    if (amount <= 0) await db.budgets.delete(existing.id);
    else await db.budgets.update(existing.id, { amount });
  } else if (amount > 0) {
    await db.budgets.put({ id: uid('bud'), categoryId, amount, createdAt: new Date().toISOString() });
  }
}

// ── Повторяющиеся ──

export interface RecurringInput {
  name: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  categoryId?: string;
  accountId: string;
  frequency: Recurring['frequency'];
  interval: number;
  nextDate: string;
  active: 0 | 1;
  autoCreate: 0 | 1;
  note?: string;
}

export function nextDateAfter(freq: Recurring['frequency'], interval: number, fromISO: string): string {
  switch (freq) {
    case 'daily': return addDays(fromISO, interval);
    case 'weekly': return addDays(fromISO, interval * 7);
    case 'monthly': return addMonths(fromISO, interval);
    case 'yearly': return addYears(fromISO, interval);
  }
}

export async function createRecurring(input: RecurringInput): Promise<string> {
  const id = uid('rec');
  await db.recurring.put({
    id,
    name: input.name.trim(),
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    categoryId: input.categoryId,
    accountId: input.accountId,
    frequency: input.frequency,
    interval: Math.max(1, input.interval),
    nextDate: input.nextDate,
    active: input.active,
    autoCreate: input.autoCreate,
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function updateRecurring(id: string, patch: Partial<RecurringInput>): Promise<void> {
  await db.recurring.update(id, patch);
}

export async function deleteRecurring(id: string): Promise<void> {
  await db.transaction('rw', db.recurring, db.transactions, async () => {
    const txs = await db.transactions.where('recurringId').equals(id).toArray();
    for (const t of txs) await db.transactions.update(t.id, { recurringId: undefined });
    await db.recurring.delete(id);
  });
}

/** Провести повторяющуюся операцию сейчас: создать транзакцию и сдвинуть nextDate. */
export async function runRecurringNow(rec: Recurring): Promise<void> {
  const now = new Date().toISOString();
  await db.transactions.put({
    id: uid('tx'),
    type: rec.type,
    amount: rec.amount,
    currency: rec.currency,
    accountId: rec.accountId,
    categoryId: rec.categoryId,
    date: rec.nextDate <= todayISO() ? todayISO() : rec.nextDate,
    description: rec.name,
    notes: rec.note,
    recurringId: rec.id,
    createdAt: now,
    updatedAt: now,
  });
  await db.recurring.update(rec.id, { nextDate: nextDateAfter(rec.frequency, rec.interval, rec.nextDate) });
}

// ── Заметки ──

export interface NoteInput {
  text: string;
  linkType: Note['linkType'];
  linkId?: string;
  linkDate?: string;
}

export async function saveNote(input: NoteInput, existingId?: string): Promise<string> {
  const now = new Date().toISOString();
  const id = existingId ?? uid('note');
  const existing = existingId ? await db.notes.get(existingId) : undefined;
  await db.notes.put({
    id,
    text: input.text.trim(),
    linkType: input.linkType,
    linkId: input.linkType === 'none' || input.linkType === 'date' ? undefined : input.linkId,
    linkDate: input.linkType === 'date' ? input.linkDate : undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  return id;
}

export async function deleteNote(id: string): Promise<void> {
  await db.notes.delete(id);
}

// ── Оценки активов ──

export async function addValuation(accountId: string, date: string, value: number, note?: string): Promise<void> {
  await db.valuations.put({
    id: uid('val'),
    accountId,
    date,
    value,
    note: note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  });
}

export async function deleteValuation(id: string): Promise<void> {
  await db.valuations.delete(id);
}

// ── Курсы валют ──

export async function saveRate(code: string, rate: number, manual: 0 | 1 = 1): Promise<void> {
  const current = await db.exchangeRates.get(code);
  await db.exchangeRates.put({
    code,
    rate,
    manual,
    updatedAt: new Date().toISOString(),
    ...(current ? {} : {}),
  } satisfies ExchangeRate);
}

// ── Категории ──

export interface CategoryInput {
  name: string;
  kind: 'income' | 'expense';
  emoji: string;
  color?: string;
  keywords: string[];
}

export async function createCategory(input: CategoryInput): Promise<string> {
  const count = await db.categories.where('kind').equals(input.kind).count();
  const id = uid('cat');
  await db.categories.put({
    id,
    name: input.name.trim(),
    kind: input.kind,
    emoji: input.emoji || (input.kind === 'expense' ? '📦' : '✨'),
    color: input.color ?? '#64748b',
    keywords: input.keywords,
    sortOrder: count,
    isSystem: 0,
  });
  return id;
}

export async function updateCategory(id: string, patch: Partial<CategoryInput>): Promise<void> {
  await db.categories.update(id, patch);
}

export async function deleteCategory(id: string): Promise<void> {
  await db.transaction('rw', db.categories, db.transactions, db.budgets, async () => {
    const txs = await db.transactions.where('categoryId').equals(id).toArray();
    for (const t of txs) await db.transactions.update(t.id, { categoryId: undefined });
    await db.budgets.where('categoryId').equals(id).delete();
    await db.categories.delete(id);
  });
}

/** Удалить системную категорию нельзя, но её можно скрыть? v1: системные удаляемы, кроме «Другое». */
export function canDeleteCategory(cat: Category, all: Category[]): boolean {
  if (cat.name === 'Другое') return false;
  const sameKindCount = all.filter((c) => c.kind === cat.kind).length;
  return sameKindCount > 1;
}
