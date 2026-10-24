import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type WishlistItem, type WishlistStatus } from '@/db/db';
import { createWishlistItem, deleteWishlistItem, updateWishlistItem } from '@/services/entities';
import { formatMoney, parseAmountInput, toMajor, COMMON_CURRENCY_CODES } from '@/lib/money';
import { Button, Card, Chip, Confirm, EmptyState, Field, Input, Select, Sheet, TextArea, TopBar } from '@/components/ui';
import { useUI } from '@/store/ui';
import { cn } from '@/lib/utils';

const STATUS_META: Record<WishlistStatus, { label: string; emoji: string }> = {
  want: { label: 'Хочу', emoji: '❤️' },
  planned: { label: 'Планирую', emoji: '📌' },
  saving: { label: 'Коплю', emoji: '🏦' },
  bought: { label: 'Куплено', emoji: '✅' },
  cancelled: { label: 'Отменено', emoji: '🚫' },
};
const PRIORITY_COLORS: Record<WishlistItem['priority'], string> = {
  high: 'var(--color-danger)', medium: 'var(--color-warning)', low: 'var(--color-muted)',
};

export function WishlistScreen({ onBack }: { onBack: () => void }) {
  const { openQuickAdd, showToast } = useUI();
  const items = useLiveQuery(() => db.wishlist.toArray(), []) ?? [];
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [deleting, setDeleting] = useState<WishlistItem | null>(null);

  const planned = items.filter((i) => ['want', 'planned', 'saving'].includes(i.status));
  const closed = items.filter((i) => ['bought', 'cancelled'].includes(i.status));
  const totalPlanned = planned.reduce((s, i) => s + i.targetAmount, 0);

  return (
    <div className="pb-24">
      <TopBar
        title="Запланировано"
        onBack={onBack}
        right={<button onClick={() => { setEditing(null); setFormOpen(true); }} className="w-9 h-9 rounded-full bg-accent-dim text-accent text-xl leading-none">+</button>}
      />
      <div className="px-4 flex flex-col gap-2">
        {planned.length > 0 && (
          <Card className="!py-3 flex justify-between items-baseline">
            <span className="text-[13px] text-muted">Всего запланировано</span>
            <span className="num font-bold">{formatMoney(totalPlanned, 'UZS')}<span className="text-faint text-[12px] font-normal"> / {planned.length} покупок</span></span>
          </Card>
        )}
        {items.length === 0 && (
          <EmptyState emoji="⭐" title="Список пуст" hint="MacBook, гитара, отпуск — всё, что хотите купить потом" />
        )}
        {planned.map((item) => (
          <Card key={item.id} className="!py-3" onClick={() => { setEditing(item); setFormOpen(true); }}>
            <div className="flex justify-between items-baseline gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{item.name}</div>
                <div className="text-[12px] text-faint mt-0.5">
                  {STATUS_META[item.status].emoji} {STATUS_META[item.status].label}
                  {item.why ? ` · ${item.why}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="num font-semibold">{formatMoney(item.targetAmount, item.currency, { compact: true })}</div>
                <div className="text-[12px]" style={{ color: PRIORITY_COLORS[item.priority] }}>
                  {item.priority === 'high' ? 'высокий' : item.priority === 'medium' ? 'средний' : 'низкий'} приоритет
                </div>
              </div>
            </div>
            <div className="flex gap-1.5 mt-2.5">
              {item.status !== 'saving' && (
                <Chip onClick={(e) => { e.stopPropagation(); void updateWishlistItem(item.id, { status: 'saving' }); }}>🏦 Коплю</Chip>
              )}
              <Chip
                onClick={(e) => {
                  e.stopPropagation();
                  openQuickAdd({ type: 'expense' });
                  showToast(`После ввода расхода создайте покупку «${item.name}»`);
                }}
              >
                💸 Купить
              </Chip>
              <Chip onClick={(e) => { e.stopPropagation(); void updateWishlistItem(item.id, { status: 'cancelled' }); }}>🚫 Отменить</Chip>
            </div>
          </Card>
        ))}
        {closed.length > 0 && (
          <>
            <h3 className="text-[13px] uppercase tracking-wider text-faint mt-3 px-1">Завершённые</h3>
            {closed.map((item) => (
              <Card key={item.id} className="opacity-60 !py-2.5" onClick={() => { setEditing(item); setFormOpen(true); }}>
                <div className="flex justify-between text-sm">
                  <span>{STATUS_META[item.status].emoji} {item.name}</span>
                  <span className="num text-muted">{formatMoney(item.targetAmount, item.currency, { compact: true })}</span>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>

      <WishlistFormSheet
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onDelete={(item) => { setFormOpen(false); setDeleting(item); }}
      />
      <Confirm
        open={!!deleting}
        title="Удалить из списка?"
        onConfirm={() => { if (deleting) void deleteWishlistItem(deleting.id); }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function WishlistFormSheet({
  open,
  editing,
  onClose,
  onDelete,
}: {
  open: boolean;
  editing: WishlistItem | null;
  onClose: () => void;
  onDelete: (item: WishlistItem) => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [priority, setPriority] = useState<WishlistItem['priority']>('medium');
  const [status, setStatus] = useState<WishlistStatus>('want');
  const [why, setWhy] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);

  if (open && editing && loaded !== editing.id) {
    setLoaded(editing.id);
    setName(editing.name);
    setAmount(String(toMajor(editing.targetAmount, editing.currency)));
    setCurrency(editing.currency);
    setPriority(editing.priority);
    setStatus(editing.status);
    setWhy(editing.why ?? '');
  }
  if (open && !editing && loaded !== 'new') {
    setLoaded('new');
    setName(''); setAmount(''); setWhy(''); setPriority('medium'); setStatus('want'); setCurrency('UZS');
  }
  if (!open && loaded !== null) setLoaded(null);

  const save = async () => {
    const minor = parseAmountInput(amount, currency);
    if (!name.trim() || !minor || minor <= 0) return;
    if (editing) {
      await updateWishlistItem(editing.id, { name: name.trim(), targetAmount: minor, currency, priority, status, why });
    } else {
      await createWishlistItem({ name: name.trim(), targetAmount: minor, currency, priority, status, why });
    }
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Покупка' : 'Новая запланированная покупка'}>
      <div className="flex flex-col gap-3.5 pt-2 pb-2">
        <Field label="Что купить">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MacBook, гитара…" />
        </Field>
        <div className="flex gap-2">
          <div className="flex-1">
            <Field label="Цена">
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="700" className="num" />
            </Field>
          </div>
          <Field label="Валюта">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-28">
              {COMMON_CURRENCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Приоритет">
          <div className="flex gap-1.5">
            {([['high', 'Высокий'], ['medium', 'Средний'], ['low', 'Низкий']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setPriority(v)} className={cn('flex-1 rounded-xl border px-2 py-2.5 text-sm', priority === v ? 'border-accent/70 bg-accent-dim text-accent' : 'border-border bg-surface-2 text-muted')}>
                {label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Зачем">
          <TextArea value={why} onChange={(e) => setWhy(e.target.value)} rows={2} placeholder="Для работы, для души…" />
        </Field>
        {editing && (
          <Field label="Статус">
            <Select value={status} onChange={(e) => setStatus(e.target.value as WishlistStatus)}>
              {(Object.keys(STATUS_META) as WishlistStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_META[s].emoji} {STATUS_META[s].label}</option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex gap-2 pt-1">
          {editing && <Button variant="danger" onClick={() => onDelete(editing)}>Удалить</Button>}
          <Button variant="primary" className="flex-1" onClick={() => void save()}>Сохранить</Button>
        </div>
      </div>
    </Sheet>
  );
}
