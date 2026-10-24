import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/db/db';
import { deleteTransaction, duplicateTransaction } from '@/services/transactions';
import { createPurchase } from '@/services/entities';
import { formatMoney, toMajor } from '@/lib/money';
import { formatDay } from '@/lib/dates';
import { Button, Confirm, Sheet } from '@/components/ui';
import { TransactionForm } from './TransactionForm';
import { useUI } from '@/store/ui';

export function TxDetailSheet() {
  const { detailTxId, closeTxDetail, showToast } = useUI();
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const tx = useLiveQuery(() => (detailTxId ? db.transactions.get(detailTxId) : undefined), [detailTxId]);
  const account = useLiveQuery(() => (tx ? db.accounts.get(tx.accountId) : undefined), [tx?.accountId]);
  const accountTo = useLiveQuery(() => (tx?.toAccountId ? db.accounts.get(tx.toAccountId) : undefined), [tx?.toAccountId]);
  const category = useLiveQuery(() => (tx?.categoryId ? db.categories.get(tx.categoryId) : undefined), [tx?.categoryId]);
  const purchase = useLiveQuery(() => (tx ? db.purchases.where('transactionId').equals(tx.id).first() : undefined), [tx?.id]);
  const relatedCommission = useLiveQuery(
    () => (tx ? db.transactions.where('relatedId').equals(tx.id).filter((t) => t.type === 'expense').first() : undefined),
    [tx?.id],
  );

  if (!detailTxId || !tx) return null;

  const typeLabel = { expense: 'Расход', income: 'Доход', transfer: 'Перевод', savings: 'Накопление' }[tx.type];
  const typeColor = { expense: 'var(--color-danger)', income: 'var(--color-accent)', transfer: 'var(--color-transfer)', savings: 'var(--color-savings)' }[tx.type];

  return (
    <Sheet open={!!detailTxId} onClose={closeTxDetail} title={editing ? 'Изменить операцию' : 'Операция'}>
      {editing ? (
        <div className="pt-1">
          <TransactionForm
            initial={{
              id: tx.id,
              type: tx.type,
              amountMajor: toMajor(tx.amount, tx.currency),
              currency: tx.currency,
              accountId: tx.accountId,
              toAccountId: tx.toAccountId,
              categoryId: tx.categoryId,
              date: tx.date,
              description: tx.description,
              notes: tx.notes,
              goalId: tx.goalId,
            }}
            onSaved={() => { setEditing(false); closeTxDetail(); showToast('Изменено ✓'); }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4 pt-1 pb-2">
          <div className="text-center">
            <div className="text-[13px] text-faint">{typeLabel}</div>
            <div className="num text-3xl font-bold mt-1" style={{ color: typeColor }}>
              {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
              {formatMoney(tx.amount, tx.currency)}
            </div>
            <div className="text-sm text-muted mt-1">{formatDay(tx.date, { withWeekday: true })}</div>
          </div>

          <div className="bg-surface-2 rounded-2xl border border-border divide-y divide-border">
            <DetailRow label="Категория" value={category ? `${category.emoji} ${category.name}` : '—'} />
            <DetailRow label={tx.type === 'transfer' || tx.type === 'savings' ? 'Откуда' : 'Счёт'} value={account?.name ?? '—'} />
            {(tx.type === 'transfer' || tx.type === 'savings') && <DetailRow label="Куда" value={accountTo?.name ?? '—'} />}
            {tx.type === 'transfer' && tx.toAmount != null && accountTo && (
              <DetailRow label="Зачислено" value={formatMoney(tx.toAmount, accountTo.currency)} />
            )}
            {relatedCommission && (
              <DetailRow
                label="Комиссия обмена"
                value={`${formatMoney(relatedCommission.amount, relatedCommission.currency)} · расход`}
              />
            )}
            {tx.description && <DetailRow label="Описание" value={tx.description} />}
            {tx.notes && <DetailRow label="Заметки" value={tx.notes} />}
            {purchase && <DetailRow label="Покупка" value={`${purchase.name} · оценка ${purchase.rating ?? '—'}/10`} />}
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(true)}>Изменить</Button>
            <Button variant="ghost" onClick={() => void duplicateTransaction(tx.id).then(() => showToast('Дубликат создан ✓'))}>
              Копия
            </Button>
          </div>

          <div className="flex gap-2">
            {!purchase && tx.type === 'expense' && (
              <Button variant="accent-soft" className="flex-1" onClick={() => setPurchaseOpen(true)}>
                Оформить как покупку
              </Button>
            )}
            <Button variant="danger" className="flex-1" onClick={() => setConfirmOpen(true)}>Удалить</Button>
          </div>
        </div>
      )}

      <Confirm
        open={confirmOpen}
        title="Удалить операцию?"
        text="Действие нельзя отменить."
        onConfirm={() => {
          void deleteTransaction(tx.id).then(() => {
            closeTxDetail();
            showToast('Удалено');
          });
        }}
        onClose={() => setConfirmOpen(false)}
      />

      <Sheet open={purchaseOpen} onClose={() => setPurchaseOpen(false)} title="Новая покупка">
        <PurchaseQuickForm
          defaultName={tx.description ?? ''}
          onSubmit={async (fields) => {
            await createPurchase({ ...fields, transactionId: tx.id });
            setPurchaseOpen(false);
            closeTxDetail();
            showToast('Покупка сохранена ✓');
          }}
        />
      </Sheet>
    </Sheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5">
      <span className="text-faint text-sm shrink-0">{label}</span>
      <span className="text-[15px] text-right">{value}</span>
    </div>
  );
}

export interface PurchaseFields {
  name: string;
  amount: number;
  currency: string;
  date: string;
  categoryId?: string;
  why?: string;
  got?: string;
  pros?: string;
  cons?: string;
  worthIt?: 'yes' | 'no' | 'unknown';
  rating?: number;
}

/** Быстрая форма карточки покупки (используется из транзакции и из экрана Покупок) */
export function PurchaseQuickForm({
  defaultName = '',
  defaultAmountMinor,
  defaultCurrency = 'UZS',
  defaultDate,
  onSubmit,
}: {
  defaultName?: string;
  defaultAmountMinor?: number;
  defaultCurrency?: string;
  defaultDate?: string;
  onSubmit: (fields: PurchaseFields) => Promise<void> | void;
}) {
  const [name, setName] = useState(defaultName);
  const [why, setWhy] = useState('');
  const [got, setGot] = useState('');
  const [pros, setPros] = useState('');
  const [cons, setCons] = useState('');
  const [worthIt, setWorthIt] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-3 pt-1 pb-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Что это было?" className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-3 outline-none focus:border-accent/60 font-medium" />
      <textarea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Зачем купил?" rows={2} className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-3 outline-none focus:border-accent/60 resize-y" />
      <textarea value={got} onChange={(e) => setGot(e.target.value)} placeholder="Что получил?" rows={2} className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-3 outline-none focus:border-accent/60 resize-y" />
      <textarea value={pros} onChange={(e) => setPros(e.target.value)} placeholder="Плюсы" rows={2} className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-3 outline-none focus:border-accent/60 resize-y" />
      <textarea value={cons} onChange={(e) => setCons(e.target.value)} placeholder="Минусы" rows={2} className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-3 outline-none focus:border-accent/60 resize-y" />
      <div>
        <div className="text-[13px] text-muted mb-1.5 px-1">Стоило ли своих денег?</div>
        <div className="flex gap-1.5">
          {([['yes', 'Да'], ['no', 'Нет'], ['unknown', 'Пока не знаю']] as Array<[typeof worthIt, string]>).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setWorthIt(v)}
              className={`flex-1 rounded-xl border px-2 py-2.5 text-sm ${worthIt === v ? 'border-accent/70 bg-accent-dim text-accent' : 'border-border bg-surface-2 text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[13px] text-muted mb-1.5 px-1">Оценка: {rating ?? '—'}/10</div>
        <input
          type="range" min={1} max={10} step={1}
          value={rating ?? 5}
          onChange={(e) => setRating(Number(e.target.value))}
          className="w-full accent-[var(--color-accent)]"
        />
      </div>
      <Button
        variant="primary" size="lg"
        disabled={busy || !name.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await onSubmit({
              name,
              amount: defaultAmountMinor ?? 0,
              currency: defaultCurrency,
              date: defaultDate ?? new Date().toISOString().slice(0, 10),
              why, got, pros, cons, worthIt,
              rating,
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        Сохранить покупку
      </Button>
    </div>
  );
}
