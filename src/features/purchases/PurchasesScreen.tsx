import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Purchase } from '@/db/db';
import { deletePurchase, updatePurchase, createPurchase } from '@/services/entities';
import { formatMoney, toMajor } from '@/lib/money';
import { formatDay } from '@/lib/dates';
import { Button, Card, Confirm, EmptyState, Field, Input, Select, Sheet, Stars, TextArea, TopBar } from '@/components/ui';
import { PurchaseQuickForm } from '@/features/transactions/TxDetailSheet';

const WORTH_LABELS: Record<string, string> = { yes: '✓ стоило', no: '✗ не стоило', unknown: '? не знаю' };
const WORTH_COLORS: Record<string, string> = { yes: 'var(--color-accent)', no: 'var(--color-danger)', unknown: 'var(--color-warning)' };

export function PurchasesScreen({ onBack }: { onBack: () => void }) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Purchase | null>(null);
  const purchases = useLiveQuery(() => db.purchases.orderBy('date').reverse().toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  const catById = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="pb-24">
      <TopBar title="Покупки" onBack={onBack} />
      <div className="px-4 flex flex-col gap-2">
        {purchases.length === 0 && (
          <EmptyState
            emoji="🛍️"
            title="Покупок пока нет"
            hint="Создайте карточку из операции расхода или через быстрый ввод («купил наушники за 40$»)"
          />
        )}
        {purchases.map((p) => (
          <Card key={p.id} onClick={() => setDetailId(p.id)} className="!py-3">
            <div className="flex justify-between items-baseline gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-[12px] text-faint mt-0.5">
                  {formatDay(p.date)}{p.categoryId ? ` · ${catById.get(p.categoryId)?.name ?? ''}` : ''}
                  {p.why ? ` · ${p.why}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="num font-semibold">{formatMoney(p.amount, p.currency, { compact: true })}</div>
                {p.worthIt && p.worthIt !== 'unknown' && (
                  <div className="text-[12px]" style={{ color: WORTH_COLORS[p.worthIt] }}>{WORTH_LABELS[p.worthIt]}</div>
                )}
                {p.rating != null && <Stars value={p.rating} />}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <PurchaseDetailSheet id={detailId} onClose={() => setDetailId(null)} onDelete={(p) => { setDetailId(null); setDeleting(p); }} />
      <Confirm
        open={!!deleting}
        title="Удалить карточку покупки?"
        text="Связанная транзакция останется."
        onConfirm={() => { if (deleting) void deletePurchase(deleting.id); }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function PurchaseDetailSheet({ id, onClose, onDelete }: { id: string | null; onClose: () => void; onDelete: (p: Purchase) => void }) {
  const purchase = useLiveQuery(() => (id ? db.purchases.get(id) : undefined), [id]);
  const categories = useLiveQuery(() => db.categories.where('kind').equals('expense').sortBy('sortOrder'), []) ?? [];
  const [loaded, setLoaded] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [why, setWhy] = useState('');
  const [got, setGot] = useState('');
  const [pros, setPros] = useState('');
  const [cons, setCons] = useState('');
  const [worthIt, setWorthIt] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [rating, setRating] = useState(5);

  const p = purchase;
  if (id && p && loaded !== p.id) {
    setLoaded(p.id);
    setName(p.name);
    setAmount(String(toMajor(p.amount, p.currency)));
    setCategoryId(p.categoryId ?? '');
    setWhy(p.why ?? '');
    setGot(p.got ?? '');
    setPros(p.pros ?? '');
    setCons(p.cons ?? '');
    setWorthIt(p.worthIt ?? 'unknown');
    setRating(p.rating ?? 5);
  }
  if (!id && loaded !== null) setLoaded(null);

  if (!id || !p) return null;

  const save = async () => {
    const minor = Math.round(parseFloat(amount.replace(',', '.')) * (p.currency === 'UZS' ? 1 : 100));
    await updatePurchase(p.id, {
      name: name.trim() || p.name,
      amount: Number.isFinite(minor) && minor > 0 ? minor : p.amount,
      categoryId: categoryId || undefined,
      why, got, pros, cons, worthIt,
      rating: p.rating != null || rating !== 5 ? rating : undefined,
    });
    onClose();
  };

  return (
    <Sheet open={!!id} onClose={onClose} title="Покупка">
      <div className="flex flex-col gap-3.5 pt-2 pb-2">
        <div className="text-center pb-1">
          <div className="num text-2xl font-bold">{formatMoney(p.amount, p.currency)}</div>
          <div className="text-[13px] text-faint">{formatDay(p.date, { withWeekday: true })}</div>
        </div>
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <div className="flex-1">
            <Field label={`Сумма (${p.currency})`}>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="num" />
            </Field>
          </div>
          <Field label="Категория">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-40">
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Зачем купил">
          <TextArea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} />
        </Field>
        <Field label="Что получил">
          <TextArea value={got} onChange={(e) => setGot(e.target.value)} rows={2} />
        </Field>
        <Field label="Плюсы">
          <TextArea value={pros} onChange={(e) => setPros(e.target.value)} rows={2} />
        </Field>
        <Field label="Минусы">
          <TextArea value={cons} onChange={(e) => setCons(e.target.value)} rows={2} />
        </Field>
        <Field label="Стоило ли своих денег?">
          <div className="flex gap-1.5">
            {([['yes', 'Да'], ['no', 'Нет'], ['unknown', 'Не знаю']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setWorthIt(v)}
                className={`flex-1 rounded-xl border px-2 py-2.5 text-sm ${worthIt === v ? 'border-accent/70 bg-accent-dim text-accent' : 'border-border bg-surface-2 text-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
        <Field label={`Оценка: ${rating}/10`}>
          <input type="range" min={1} max={10} value={rating} onChange={(e) => setRating(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
        </Field>
        <div className="flex gap-2 pt-1">
          <Button variant="danger" onClick={() => onDelete(p)}>Удалить</Button>
          <Button variant="primary" className="flex-1" onClick={() => void save()}>Сохранить</Button>
        </div>
      </div>
    </Sheet>
  );
}

export function NewPurchaseSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: { name?: string; amountMinor?: number; currency?: string; date?: string } }) {
  return (
    <Sheet open={open} onClose={onClose} title="Новая покупка">
      <PurchaseQuickForm
        defaultName={initial?.name}
        defaultAmountMinor={initial?.amountMinor}
        defaultCurrency={initial?.currency}
        defaultDate={initial?.date}
        onSubmit={async (fields) => {
          await createPurchase({
            name: fields.name,
            amount: initial?.amountMinor ?? 0,
            currency: initial?.currency ?? 'UZS',
            date: initial?.date ?? fields.date,
            why: fields.why,
            got: fields.got,
            pros: fields.pros,
            cons: fields.cons,
            worthIt: fields.worthIt,
            rating: fields.rating,
          });
          onClose();
        }}
      />
    </Sheet>
  );
}
