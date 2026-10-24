import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Transaction, type TxType } from '@/db/db';
import { formatMoney, convertMinor, ratesMap, toMajor } from '@/lib/money';
import { formatDayRelative, monthEnd, monthKey, monthKeyAdd, monthStart, todayISO } from '@/lib/dates';
import { Card, Chip, EmptyState, Input, Sheet, TopBar } from '@/components/ui';
import { useUI } from '@/store/ui';
import { cn } from '@/lib/utils';

const TYPE_META: Record<TxType, { label: string; color: string }> = {
  expense: { label: 'Расход', color: 'var(--color-danger)' },
  income: { label: 'Доход', color: 'var(--color-accent)' },
  transfer: { label: 'Перевод', color: 'var(--color-transfer)' },
  savings: { label: 'Накопление', color: 'var(--color-savings)' },
};

type Period = 'month' | 'prev' | '3m' | 'year' | 'all';

export function TransactionsScreen() {
  const { openTxDetail } = useUI();
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [period, setPeriod] = useState<Period>('month');
  const [types, setTypes] = useState<TxType[]>([]);
  const [catIds, setCatIds] = useState<string[]>([]);
  const [accIds, setAccIds] = useState<string[]>([]);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) ?? [];
  const ratesList = useLiveQuery(() => db.exchangeRates.toArray(), []) ?? [];
  const base = settings?.baseCurrency ?? 'UZS';

  const txs = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), []) ?? [];

  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const rates = useMemo(() => ratesMap(ratesList), [ratesList]);

  const filtered = useMemo(() => {
    const mKey = monthKey(todayISO());
    let from = '';
    let to = '9999-99-99';
    if (period === 'month') { from = monthStart(mKey); to = monthEnd(mKey); }
    else if (period === 'prev') { const p = monthKeyAdd(mKey, -1); from = monthStart(p); to = monthEnd(p); }
    else if (period === '3m') { from = monthStart(monthKeyAdd(mKey, -2)); to = monthEnd(mKey); }
    else if (period === 'year') { from = `${mKey.slice(0, 4)}-01-01`; to = monthEnd(mKey); }

    const min = minAmount ? parseFloat(minAmount.replace(',', '.')) : null;
    const max = maxAmount ? parseFloat(maxAmount.replace(',', '.')) : null;
    const q = search.trim().toLowerCase();

    return txs.filter((t) => {
      if (t.date < from || t.date > to) return false;
      if (types.length > 0 && !types.includes(t.type)) return false;
      if (catIds.length > 0 && (!t.categoryId || !catIds.includes(t.categoryId))) return false;
      if (accIds.length > 0) {
        if (!accIds.includes(t.accountId) && !(t.toAccountId && accIds.includes(t.toAccountId))) return false;
      }
      const major = toMajor(convertMinor(t.amount, t.currency, base, rates), base);
      if (min != null && major < min) return false;
      if (max != null && major > max) return false;
      if (q) {
        const hay = [
          t.description ?? '', t.notes ?? '',
          t.categoryId ? catById.get(t.categoryId)?.name ?? '' : '',
          t.accountId ? accById.get(t.accountId)?.name ?? '' : '',
          String(toMajor(t.amount, t.currency)),
          t.date,
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [txs, period, types, catIds, accIds, minAmount, maxAmount, search, base, rates, catById, accById]);

  // группировка по дням
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const list = map.get(t.date) ?? [];
      list.push(t);
      map.set(t.date, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const totals = useMemo(() => {
    let income = 0, expense = 0;
    for (const t of filtered) {
      const v = convertMinor(t.amount, t.currency, base, rates);
      if (t.type === 'income') income += v;
      else if (t.type === 'expense') expense += v;
    }
    return { income, expense };
  }, [filtered, base, rates]);

  const activeFilters = types.length + catIds.length + accIds.length + (minAmount ? 1 : 0) + (maxAmount ? 1 : 0) + (period !== 'month' ? 1 : 0);

  return (
    <div className="pb-24">
      <TopBar
        title="Операции"
        right={
          <button
            onClick={() => setFiltersOpen(true)}
            className={cn('relative h-9 px-3.5 rounded-full text-[13px] border', activeFilters ? 'border-accent/70 bg-accent-dim text-accent' : 'border-border bg-surface-2 text-muted')}
          >
            Фильтры{activeFilters ? ` · ${activeFilters}` : ''}
          </button>
        }
      />

      <div className="px-4 flex flex-col gap-2.5">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск: еда, ноутбук, сентябрь, 5000…"
        />

        <div className="flex gap-2 text-[13px] text-muted px-1">
          <span>Доход: <b className="num text-accent">{formatMoney(totals.income, base, { compact: true })}</b></span>
          <span>·</span>
          <span>Расход: <b className="num text-danger">{formatMoney(totals.expense, base, { compact: true })}</b></span>
        </div>

        {groups.length === 0 && (
          <EmptyState
            emoji="🧾"
            title="Операций нет"
            hint="Добавьте первую через кнопку + внизу"
          />
        )}

        {groups.map(([day, list]) => {
          const dayNet = list.reduce((s, t) => {
            const v = convertMinor(t.amount, t.currency, base, rates);
            return s + (t.type === 'income' ? v : t.type === 'expense' ? -v : 0);
          }, 0);
          return (
            <div key={day}>
              <div className="flex justify-between items-baseline px-1 mt-4 mb-1.5">
                <span className="text-[13px] font-semibold text-muted">{formatDayRelative(day)}</span>
                {dayNet !== 0 && (
                  <span className="text-[12px] text-faint num">{dayNet > 0 ? '+' : '−'}{formatMoney(Math.abs(dayNet), base, { compact: true })}</span>
                )}
              </div>
              <Card className="!p-0 overflow-hidden">
                {list.map((t, i) => (
                  <TxRow
                    key={t.id}
                    tx={t}
                    cat={t.categoryId ? catById.get(t.categoryId) : undefined}
                    acc={accById.get(t.accountId)}
                    accTo={t.toAccountId ? accById.get(t.toAccountId) : undefined}
                    onClick={() => openTxDetail(t.id)}
                    divider={i < list.length - 1}
                  />
                ))}
              </Card>
            </div>
          );
        })}
      </div>

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Фильтры">
        <div className="flex flex-col gap-4 pt-2 pb-2">
          <div>
            <div className="text-[13px] text-muted mb-2 px-1">Период</div>
            <div className="flex gap-1.5 flex-wrap">
              {([['month', 'Этот месяц'], ['prev', 'Прошлый'], ['3m', '3 месяца'], ['year', 'Год'], ['all', 'Всё']] as Array<[Period, string]>).map(([p, label]) => (
                <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>{label}</Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[13px] text-muted mb-2 px-1">Тип</div>
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(TYPE_META) as TxType[]).map((t) => (
                <Chip key={t} active={types.includes(t)} color={TYPE_META[t].color} onClick={() => setTypes((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))}>
                  {TYPE_META[t].label}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[13px] text-muted mb-2 px-1">Категории</div>
            <div className="flex gap-1.5 flex-wrap">
              {categories.map((c) => (
                <Chip key={c.id} active={catIds.includes(c.id)} color={c.color} onClick={() => setCatIds((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))}>
                  {c.emoji} {c.name}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[13px] text-muted mb-2 px-1">Счета</div>
            <div className="flex gap-1.5 flex-wrap">
              {accounts.map((a) => (
                <Chip key={a.id} active={accIds.includes(a.id)} onClick={() => setAccIds((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]))}>
                  {a.name}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Input inputMode="decimal" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder={`Сумма от (${base})`} className="num" />
            <Input inputMode="decimal" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="до" className="num" />
          </div>
          <button
            className="text-faint text-sm underline underline-offset-4 self-center pb-2"
            onClick={() => { setTypes([]); setCatIds([]); setAccIds([]); setMinAmount(''); setMaxAmount(''); setPeriod('month'); }}
          >
            Сбросить всё
          </button>
        </div>
      </Sheet>
    </div>
  );
}

export function TxRow({
  tx,
  cat,
  acc,
  accTo,
  onClick,
  divider,
}: {
  tx: Transaction;
  cat?: { emoji: string; name: string; color?: string };
  acc?: { name: string };
  accTo?: { name: string };
  onClick: () => void;
  divider?: boolean;
}) {
  const meta = TYPE_META[tx.type];
  return (
    <div
      onClick={onClick}
      className={cn('flex items-center gap-3 px-4 py-3 active:bg-surface-2 cursor-pointer', divider && 'border-b border-border')}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
        style={{ backgroundColor: cat?.color ? `${cat.color}22` : 'var(--color-surface-2)' }}
      >
        {cat?.emoji ?? (tx.type === 'transfer' ? '🔁' : tx.type === 'savings' ? '🏦' : tx.type === 'income' ? '💰' : '📦')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] truncate">{tx.description?.trim() || cat?.name || meta.label}</div>
        <div className="text-[12px] text-faint truncate">
          {acc?.name}{accTo ? ` → ${accTo.name}` : ''} · {tx.date.slice(8)}.{tx.date.slice(5, 7)}
        </div>
      </div>
      <div className="num text-[15px] font-semibold text-right shrink-0" style={{ color: meta.color }}>
        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}{formatMoney(tx.amount, tx.currency)}
      </div>
    </div>
  );
}
