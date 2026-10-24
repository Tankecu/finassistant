import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Recurring, type RecurringFrequency } from '@/db/db';
import { createRecurring, deleteRecurring, runRecurringNow, updateRecurring } from '@/services/entities';
import { formatMoney, parseAmountInput, toMajor } from '@/lib/money';
import { todayISO, formatDayRelative } from '@/lib/dates';
import { Button, Card, Confirm, EmptyState, Field, Input, Select, Sheet, TopBar } from '@/components/ui';
import { useUI } from '@/store/ui';
import { cn } from '@/lib/utils';

const FREQ_FULL: Record<RecurringFrequency, string> = {
  daily: 'каждый день', weekly: 'каждую неделю', monthly: 'каждый месяц', yearly: 'каждый год',
};

export function RecurringScreen({ onBack }: { onBack: () => void }) {
  const { showToast } = useUI();
  const list = useLiveQuery(() => db.recurring.toArray(), []) ?? [];
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.archived).toArray(), []) ?? [];
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Recurring | null>(null);

  const today = todayISO();
  const active = list.filter((r) => r.active === 1);
  const paused = list.filter((r) => r.active === 0);

  return (
    <div className="pb-24">
      <TopBar
        title="Регулярные платежи"
        onBack={onBack}
        right={<button onClick={() => { setEditingId(null); setFormOpen(true); }} className="w-9 h-9 rounded-full bg-accent-dim text-accent text-xl leading-none">+</button>}
      />
      <div className="px-4 flex flex-col gap-2">
        {list.length === 0 && (
          <EmptyState emoji="🔁" title="Регулярных операций нет" hint="Аренда, подписки, зарплата — покажутся отдельно и по расписанию" />
        )}
        {active.map((r) => {
          const due = r.nextDate <= today;
          return (
            <Card key={r.id} className="!py-3" onClick={() => { setEditingId(r.id); setFormOpen(true); }}>
              <div className="flex justify-between items-baseline gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-[12px] text-faint mt-0.5">
                    {FREQ_FULL[r.frequency]}{r.interval > 1 ? ` ×${r.interval}` : ''} · {accounts.find((a) => a.id === r.accountId)?.name ?? '—'}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="num font-semibold" style={{ color: r.type === 'income' ? 'var(--color-accent)' : 'var(--color-danger)' }}>
                    {formatMoney(r.amount, r.currency, { compact: true })}
                  </div>
                  <div className={cn('text-[12px]', due ? 'text-warning font-medium' : 'text-faint')}>
                    {due ? 'ждёт проведения' : `с ${formatDayRelative(r.nextDate).toLowerCase()}`}
                  </div>
                </div>
              </div>
              {due && (
                <Button
                  variant="accent-soft" size="sm" className="mt-2.5 w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    void runRecurringNow(r).then(() => showToast('Проведено ✓'));
                  }}
                >
                  Провести сейчас
                </Button>
              )}
            </Card>
          );
        })}
        {paused.length > 0 && (
          <>
            <h3 className="text-[13px] uppercase tracking-wider text-faint mt-3 px-1">На паузе</h3>
            {paused.map((r) => (
              <Card key={r.id} className="opacity-60 !py-2.5" onClick={() => { setEditingId(r.id); setFormOpen(true); }}>
                <div className="flex justify-between text-sm">
                  <span>{r.name}</span>
                  <span className="num text-muted">{formatMoney(r.amount, r.currency, { compact: true })}</span>
                </div>
              </Card>
            ))}
          </>
        )}
        <p className="text-faint text-[13px] px-1 mt-1">
          {settings?.autoCreateRecurring
            ? 'Ожидающие операции создаются автоматически при открытии приложения.'
            : 'Ожидающие платежи проводятся вручную кнопкой «Провести сейчас».'}
        </p>
      </div>

      <RecurringFormSheet
        open={formOpen}
        editingId={editingId}
        onClose={() => setFormOpen(false)}
        onDelete={(id) => { setFormOpen(false); setDeleting(list.find((r) => r.id === id) ?? null); }}
      />
      <Confirm
        open={!!deleting}
        title={`Удалить «${deleting?.name}»?`}
        text="Созданные ранее операции останутся."
        onConfirm={() => { if (deleting) void deleteRecurring(deleting.id); }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function RecurringFormSheet({
  open,
  editingId,
  onClose,
  onDelete,
}: {
  open: boolean;
  editingId: string | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.archived).toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []) ?? [];
  const existing = useLiveQuery(() => (editingId ? db.recurring.get(editingId) : undefined), [editingId]);
  const [name, setName] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [interval, setIntervalNum] = useState('1');
  const [nextDate, setNextDate] = useState(todayISO());
  const [active, setActive] = useState(true);
  const [autoCreate, setAutoCreate] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);

  if (open && editingId && existing && loaded !== existing.id) {
    setLoaded(existing.id);
    setName(existing.name);
    setType(existing.type);
    setAmount(String(toMajor(existing.amount, existing.currency)));
    setCurrency(existing.currency);
    setCategoryId(existing.categoryId ?? '');
    setAccountId(existing.accountId);
    setFrequency(existing.frequency);
    setIntervalNum(String(existing.interval));
    setNextDate(existing.nextDate);
    setActive(existing.active === 1);
    setAutoCreate(existing.autoCreate === 1);
  }
  if (open && !editingId && loaded !== 'new') {
    setLoaded('new');
    setName(''); setAmount(''); setType('expense'); setCurrency('UZS'); setCategoryId('');
    setFrequency('monthly'); setIntervalNum('1'); setNextDate(todayISO()); setActive(true); setAutoCreate(false);
  }
  if (!open && loaded !== null) setLoaded(null);

  const kindCats = categories.filter((c) => c.kind === type);

  const save = async () => {
    const minor = parseAmountInput(amount, currency);
    if (!name.trim() || !minor || minor <= 0 || !accountId) return;
    const input = {
      name: name.trim(),
      type,
      amount: minor,
      currency,
      categoryId: categoryId || undefined,
      accountId,
      frequency,
      interval: Math.max(1, parseInt(interval, 10) || 1),
      nextDate,
      active: active ? (1 as const) : (0 as const),
      autoCreate: autoCreate ? (1 as const) : (0 as const),
    };
    if (editingId) await updateRecurring(editingId, input);
    else await createRecurring(input);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={editingId ? 'Регулярный платёж' : 'Новый регулярный платёж'}>
      <div className="flex flex-col gap-3.5 pt-2 pb-2">
        <div className="flex gap-2">
          <button onClick={() => setType('expense')} className={cn('flex-1 rounded-xl border py-2.5 text-sm', type === 'expense' ? 'border-danger/70 bg-danger-dim text-danger' : 'border-border bg-surface-2 text-muted')}>Расход</button>
          <button onClick={() => setType('income')} className={cn('flex-1 rounded-xl border py-2.5 text-sm', type === 'income' ? 'border-accent/70 bg-accent-dim text-accent' : 'border-border bg-surface-2 text-muted')}>Доход</button>
        </div>
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Аренда, подписка, зарплата…" />
        </Field>
        <div className="flex gap-2">
          <div className="flex-1">
            <Field label="Сумма">
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="num" />
            </Field>
          </div>
          <Field label="Валюта">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-24">
              {['UZS', 'USD', 'EUR', 'RUB'].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Повтор">
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)} className="w-36">
              {(Object.keys(FREQ_FULL) as RecurringFrequency[]).map((f) => <option key={f} value={f}>{FREQ_FULL[f]}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Field label="Каждые N периодов">
              <Input inputMode="numeric" value={interval} onChange={(e) => setIntervalNum(e.target.value)} className="num" />
            </Field>
          </div>
          <Field label="Следующее">
            <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="w-40" />
          </Field>
        </div>
        <Field label="Счёт">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">—</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Категория">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">—</option>
            {kindCats.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2.5 text-sm text-muted">
          <input type="checkbox" checked={autoCreate} onChange={(e) => setAutoCreate(e.target.checked)} className="w-5 h-5 accent-[var(--color-accent)]" />
          Создавать операцию автоматически
        </label>
        {editingId && (
          <label className="flex items-center gap-2.5 text-sm text-muted">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-5 h-5 accent-[var(--color-accent)]" />
            Активен
          </label>
        )}
        <div className="flex gap-2 pt-1">
          {editingId && <Button variant="danger" onClick={() => editingId && onDelete(editingId)}>Удалить</Button>}
          <Button variant="primary" className="flex-1" onClick={() => void save()}>Сохранить</Button>
        </div>
      </div>
    </Sheet>
  );
}
