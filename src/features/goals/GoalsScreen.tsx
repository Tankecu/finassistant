import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { createGoal, deleteGoal, updateGoal } from '@/services/entities';
import { goalProgress } from '@/services/selectors';
import { formatMoney, parseAmountInput, toMajor, convertMinor, COMMON_CURRENCY_CODES } from '@/lib/money';
import { todayISO } from '@/lib/dates';
import { Button, Card, Confirm, EmptyState, Field, Input, ProgressBar, Select, Sheet, TopBar, TextArea } from '@/components/ui';
import { useUI } from '@/store/ui';

export function GoalsScreen({ onBack }: { onBack: () => void }) {
  const { openQuickAdd, showToast } = useUI();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const snap = {
    accounts: useLiveQuery(() => db.accounts.toArray(), []) ?? [],
    transactions: useLiveQuery(() => db.transactions.toArray(), []) ?? [],
    valuations: useLiveQuery(() => db.valuations.toArray(), []) ?? [],
    rates: useLiveQuery(() => db.exchangeRates.toArray(), []) ?? [],
    categories: [],
    goals: useLiveQuery(() => db.goals.toArray(), []) ?? [],
    baseCurrency: 'UZS',
  };
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  snap.baseCurrency = settings?.baseCurrency ?? 'UZS';
  const base = snap.baseCurrency;

  const active = snap.goals.filter((g) => g.status === 'active');
  const done = snap.goals.filter((g) => g.status !== 'active');

  return (
    <div className="pb-24">
      <TopBar
        title="Цели"
        onBack={onBack}
        right={
          <button onClick={() => { setEditing(null); setFormOpen(true); }} className="w-9 h-9 rounded-full bg-accent-dim text-accent text-xl leading-none">
            +
          </button>
        }
      />
      <div className="px-4 flex flex-col gap-3">
        {active.length === 0 && (
          <EmptyState emoji="🎯" title="Целей пока нет" hint="Например: «Америка», ноутбук, подушка безопасности" />
        )}
        {active.map((g) => {
          const { amount, share } = goalProgress(g, snap);
          const remaining = Math.max(0, g.targetAmount - amount);
          // средний темп: по savings-операциям этой цели за всё время
          const goalTxs = snap.transactions.filter((t) => t.type === 'savings' && (t.goalId === g.id || (g.linkedAccountId && t.toAccountId === g.linkedAccountId)));
          const months = new Set(goalTxs.map((t) => t.date.slice(0, 7)));
          const ratesMap = Object.fromEntries(snap.rates.map((r) => [r.code, r.rate]));
          const inGoalCurrency = (t: (typeof goalTxs)[number]) => convertMinor(t.amount, t.currency, g.currency, ratesMap);
          const avgMonthly = months.size > 0 ? goalTxs.reduce((s, t) => s + inGoalCurrency(t), 0) / months.size : 0;
          const monthsLeft = avgMonthly > 0 ? Math.ceil(remaining / avgMonthly) : null;
          const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline).getTime() - new Date(todayISO()).getTime()) / 86_400_000) : null;
          const deadlineHint = daysLeft !== null ? (daysLeft >= 0 ? ` · осталось ${daysLeft} дн.` : ` · срок прошёл ${-daysLeft} дн. назад`) : '';

          return (
            <Card key={g.id} onClick={() => { setEditing(g.id); setFormOpen(true); }}>
              <div className="flex justify-between items-baseline mb-2">
                <div className="font-semibold text-[16px]">🎯 {g.name}</div>
                <div className="num text-sm text-muted">{Math.round(share * 100)}%</div>
              </div>
              <ProgressBar value={share} />
              <div className="flex justify-between items-baseline mt-2 text-[13px]">
                <span className="num text-text font-medium">{formatMoney(amount, g.currency)}</span>
                <span className="num text-faint">из {formatMoney(g.targetAmount, g.currency)}</span>
              </div>
              <div className="flex justify-between items-center mt-2.5 text-[12px] text-faint">
                <span>
                  {remaining > 0
                    ? `Осталось ${formatMoney(remaining, g.currency, { compact: true })}${monthsLeft ? ` · ~${monthsLeft} мес. при темпе ${formatMoney(Math.round(avgMonthly), g.currency, { compact: true })}/мес` : ''}`
                    : 'Цель достигнута 🎉'}
                  {deadlineHint}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); openQuickAdd({ type: 'savings', goalId: g.id }); showToast(`Откладываем на «${g.name}»`); }}
                  className="text-accent font-medium shrink-0"
                >
                  + Отложить
                </button>
              </div>
            </Card>
          );
        })}

        {done.length > 0 && (
          <>
            <h3 className="text-[13px] uppercase tracking-wider text-faint mt-3 px-1">Архив</h3>
            {done.map((g) => (
              <Card key={g.id} className="opacity-60" onClick={() => { setEditing(g.id); setFormOpen(true); }}>
                <div className="flex justify-between">
                  <span>{g.status === 'done' ? '✓' : '🚫'} {g.name}</span>
                  <span className="num text-sm text-muted">{formatMoney(g.targetAmount, g.currency)}</span>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>

      <GoalFormSheet
        open={formOpen}
        editingId={editing}
        base={base}
        onClose={() => setFormOpen(false)}
        onDelete={(id) => { setFormOpen(false); setDeleting(id); }}
      />

      <Confirm
        open={!!deleting}
        title="Удалить цель?"
        text="Связанные операции накопления останутся, но отвяжутся от цели."
        onConfirm={() => { if (deleting) void deleteGoal(deleting); }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function GoalFormSheet({
  open,
  editingId,
  base,
  onClose,
  onDelete,
}: {
  open: boolean;
  editingId: string | null;
  base: string;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const existing = useLiveQuery(() => (editingId ? db.goals.get(editingId) : undefined), [editingId]);
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.archived && a.kind !== 'liability').toArray(), []) ?? [];

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(base);
  const [deadline, setDeadline] = useState('');
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'active' | 'done' | 'archived'>('active');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // заполняем форму при открытии существующей цели
  if (open && editingId && existing && loadedFor !== editingId) {
    setName(existing.name);
    setAmount(String(toMajor(existing.targetAmount, existing.currency)));
    setCurrency(existing.currency);
    setDeadline(existing.deadline ?? '');
    setAccountId(existing.linkedAccountId ?? '');
    setNote(existing.note ?? '');
    setStatus(existing.status);
    setLoadedFor(editingId);
  }
  if (open && !editingId && loadedFor !== 'new') {
    setName(''); setAmount(''); setDeadline(''); setAccountId(''); setNote(''); setStatus('active'); setCurrency(base);
    setLoadedFor('new');
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const save = async () => {
    const minor = parseAmountInput(amount, currency);
    if (!name.trim() || !minor || minor <= 0) return;
    const input = {
      name: name.trim(),
      targetAmount: minor,
      currency,
      deadline: deadline || undefined,
      linkedAccountId: accountId || undefined,
      note: note || undefined,
    };
    if (editingId) {
      await updateGoal(editingId, { ...input, status });
    } else {
      await createGoal(input);
    }
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={editingId ? 'Цель' : 'Новая цель'}>
      <div className="flex flex-col gap-3.5 pt-2 pb-2">
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Америка, ноутбук, подушка…" />
        </Field>
        <div className="flex gap-2">
          <div className="flex-1">
            <Field label="Сколько нужно">
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" className="num" />
            </Field>
          </div>
          <Field label="Валюта">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-28">
              {COMMON_CURRENCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Field label="Дата (когда)">
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
          <Field label="Счёт цели">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Без счёта</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Заметка">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Зачем эта цель…" />
        </Field>
        {editingId && (
          <Field label="Статус">
            <Select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'done' | 'archived')}>
              <option value="active">Активна</option>
              <option value="done">Достигнута</option>
              <option value="archived">В архиве</option>
            </Select>
          </Field>
        )}
        <div className="flex gap-2 pt-1 pb-2">
          {editingId && (
            <Button variant="danger" onClick={() => onDelete(editingId)}>Удалить</Button>
          )}
          <Button variant="primary" className="flex-1" onClick={() => void save()}>Сохранить</Button>
        </div>
      </div>
    </Sheet>
  );
}
