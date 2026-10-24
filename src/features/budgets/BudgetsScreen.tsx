import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { setBudget } from '@/services/entities';
import { monthStats } from '@/services/selectors';
import { useSnapshot } from '@/services/useSnapshot';
import { formatMoney, parseAmountInput } from '@/lib/money';
import { currentMonthKey, formatMonthKey, monthKeyAdd } from '@/lib/dates';
import { Button, Card, EmptyState, Field, Input, ProgressBar, Select, Sheet, TopBar } from '@/components/ui';

export function BudgetsScreen({ onBack }: { onBack: () => void }) {
  const snap = useSnapshot();
  const budgets = useLiveQuery(() => db.budgets.toArray(), []) ?? [];
  const [mKey, setMKey] = useState(currentMonthKey());
  const [adding, setAdding] = useState(false);
  const [catId, setCatId] = useState('');
  const [amount, setAmount] = useState('');

  if (!snap) return <div className="flex-1 flex items-center justify-center text-faint text-sm">Загрузка…</div>;
  const stats = monthStats(snap, mKey);
  const spentByCat = new Map(stats.byCategoryExpense.map((x) => [x.category.id, x.total]));
  const isCurrent = mKey === currentMonthKey();

  return (
    <div className="pb-24">
      <TopBar
        title="Бюджеты"
        onBack={onBack}
        right={
          <div className="flex items-center gap-1">
            <button onClick={() => setMKey(monthKeyAdd(mKey, -1))} className="w-8 h-8 rounded-full bg-surface-2 text-muted">‹</button>
            <span className="text-[13px] text-muted w-20 text-center">{formatMonthKey(mKey)}</span>
            <button onClick={() => setMKey(monthKeyAdd(mKey, 1))} disabled={isCurrent} className="w-8 h-8 rounded-full bg-surface-2 text-muted disabled:opacity-30">›</button>
          </div>
        }
      />
      <div className="px-4 flex flex-col gap-2.5">
        {budgets.length === 0 && (
          <EmptyState emoji="🎚" title="Лимитов нет" hint="Мягкие ориентиры на месяц — не мешают вводу операций" />
        )}
        {budgets.map((b) => {
          const cat = snap.categories.find((c) => c.id === b.categoryId);
          if (!cat) return null;
          const spent = spentByCat.get(b.categoryId) ?? 0;
          const over = spent > b.amount;
          return (
            <Card key={b.id} className="!py-3.5" onClick={() => { setCatId(b.categoryId); setAmount(String(Math.round(b.amount))); setAdding(true); }}>
              <div className="flex justify-between items-baseline mb-2">
                <span className="font-medium">{cat.emoji} {cat.name}</span>
                <span className="num text-[14px]">
                  <b style={{ color: over ? 'var(--color-danger)' : 'var(--color-text)' }}>{formatMoney(spent, snap.baseCurrency, { compact: true })}</b>
                  <span className="text-faint"> / {formatMoney(b.amount, snap.baseCurrency, { compact: true })}</span>
                </span>
              </div>
              <ProgressBar value={b.amount > 0 ? spent / b.amount : 0} color={over ? 'var(--color-danger)' : cat.color} />
            </Card>
          );
        })}

        <Button variant="accent-soft" size="lg" onClick={() => { setCatId(''); setAmount(''); setAdding(true); }}>
          + Лимит на категорию
        </Button>
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Месячный лимит">
        <div className="flex flex-col gap-3.5 pt-2 pb-2">
          <Field label="Категория расхода">
            <Select value={catId} onChange={(e) => setCatId(e.target.value)}>
              <option value="">—</option>
              {snap.categories.filter((c) => c.kind === 'expense').map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={`Лимит в месяц (${snap.baseCurrency})`}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150" className="num" />
          </Field>
          <Button
            variant="primary" size="lg"
            onClick={async () => {
              const minor = parseAmountInput(amount, snap.baseCurrency);
              if (!catId) return;
              await setBudget(catId, minor ?? 0);
              setAdding(false);
            }}
          >
            Сохранить лимит
          </Button>
          {catId && (
            <button
              className="text-faint text-sm underline underline-offset-4 pb-2 self-center"
              onClick={async () => { await setBudget(catId, 0); setAdding(false); }}
            >
              Убрать лимит для этой категории
            </button>
          )}
        </div>
      </Sheet>
    </div>
  );
}
