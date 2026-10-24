import { db, type AccountKind } from '@/db/db';
import { uid } from '@/lib/utils';

export interface AccountInput {
  name: string;
  kind: AccountKind;
  currency: string;
  openingBalance: number;
  color?: string;
  notes?: string;
}

export async function createAccount(input: AccountInput): Promise<string> {
  const count = await db.accounts.count();
  const id = uid('acc');
  await db.accounts.put({
    id,
    name: input.name.trim(),
    kind: input.kind,
    currency: input.currency,
    openingBalance: input.openingBalance,
    color: input.color,
    notes: input.notes?.trim() || undefined,
    archived: 0,
    sortOrder: count,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function updateAccount(id: string, patch: Partial<AccountInput> & { archived?: 0 | 1 }): Promise<void> {
  const { name, notes, ...rest } = patch;
  await db.accounts.update(id, {
    ...(name !== undefined ? { name: name.trim() } : {}),
    ...(notes !== undefined ? { notes: notes.trim() || undefined } : {}),
    ...rest,
  });
}

export async function deleteAccount(id: string): Promise<void> {
  await db.transaction('rw', db.accounts, db.transactions, db.valuations, db.goals, async () => {
    const txs = await db.transactions.where('accountId').equals(id).toArray();
    const txsTo = await db.transactions.where('toAccountId').equals(id).toArray();
    const ids = [...new Set([...txs, ...txsTo].map((t) => t.id))];
    await db.transactions.bulkDelete(ids);
    await db.valuations.where('accountId').equals(id).delete();
    const goals = await db.goals.where('linkedAccountId').equals(id).toArray();
    for (const g of goals) await db.goals.update(g.id, { linkedAccountId: undefined });
    await db.accounts.delete(id);
  });
}

export const ACCOUNT_COLORS = [
  '#34d399', '#60a5fa', '#a78bfa', '#f59e0b', '#f472b6', '#2dd4bf', '#fb923c', '#94a3b8',
];

export function suggestAccountColor(kind: AccountKind): string {
  const map: Partial<Record<AccountKind, string>> = {
    cash: '#34d399',
    card: '#60a5fa',
    bank: '#a78bfa',
    ewallet: '#2dd4bf',
    savings: '#f59e0b',
    investment: '#f472b6',
    crypto: '#fb923c',
    asset: '#94a3b8',
    liability: '#f87171',
  };
  return map[kind] ?? '#94a3b8';
}

export const DEFAULT_ACCOUNT_KINDS: AccountKind[] = [
  'cash', 'card', 'bank', 'ewallet', 'savings', 'investment', 'crypto', 'asset', 'liability',
];
