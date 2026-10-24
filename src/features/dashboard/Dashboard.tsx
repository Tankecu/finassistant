import { computePosition, monthStats, netWorthSeries } from '@/services/selectors';
import { useSnapshot } from '@/services/useSnapshot';
import { computeInsights } from '@/services/insights';
import { formatMoney, formatNumberCompact } from '@/lib/money';
import { currentMonthKey, formatMonthKey, monthKeyAdd, formatPercent } from '@/lib/dates';
import { LineChart, MiniBars } from '@/components/charts';
import { Card, SectionTitle } from '@/components/ui';
import { useUI } from '@/store/ui';
import type { TxType } from '@/db/db';

const ACTION_BUTTONS: Array<{ type: TxType; label: string; emoji: string; color: string }> = [
  { type: 'expense', label: 'Расход', emoji: '💸', color: 'var(--color-danger)' },
  { type: 'income', label: 'Доход', emoji: '💰', color: 'var(--color-accent)' },
  { type: 'transfer', label: 'Перевод', emoji: '🔁', color: 'var(--color-transfer)' },
  { type: 'savings', label: 'Отложить', emoji: '🏦', color: 'var(--color-savings)' },
];

export function Dashboard() {
  const { openQuickAdd, setTab } = useUI();

  const snap = useSnapshot();

  if (!snap) {
    return <div className="flex-1 flex items-center justify-center text-faint text-sm">Загрузка…</div>;
  }

  const base = snap.baseCurrency;
  const mKey = currentMonthKey();
  const pos = computePosition(snap);
  const stats = monthStats(snap, mKey);
  const prevStats = monthStats(snap, monthKeyAdd(mKey, -1));

  const series = netWorthSeries(snap, 12);
  const nwNow = pos.netWorth;
  const nwPrevMonth = series.length >= 2 ? series[series.length - 2].value : nwNow;
  const nwPrevYear = series.length >= 2 ? series[0].value : nwNow;
  const dMonth = nwNow - nwPrevMonth;
  const dYear = nwNow - nwPrevYear;

  const freeMoney = pos.now;
  const insights = computeInsights(snap, mKey);
  const topCats = stats.byCategoryExpense.slice(0, 5);

  return (
    <div className="flex flex-col gap-4 px-4 pt-2 pb-24">
      {/* Net Worth */}
      <div>
        <div className="flex items-baseline justify-between px-1">
          <span className="text-[13px] text-muted">Общий капитал</span>
          <span className="text-[13px] text-faint">{formatMonthKey(mKey)}</span>
        </div>
        <div className="num text-[38px] leading-tight font-bold tracking-tight">{formatMoney(nwNow, base, { compact: nwNow >= 100_000_000 })}</div>
        <div className="flex gap-2 mt-1.5">
          <DeltaBadge label="за месяц" value={dMonth} base={base} />
          <DeltaBadge label="за год" value={dYear} base={base} />
        </div>
      </div>

      {/* Ключевые числа месяца */}
      <div className="grid grid-cols-2 gap-2.5">
        <MiniStat label="Доходы" value={formatMoney(stats.income, base, { compact: true })} color="var(--color-accent)" sub={prevStats.income > 0 ? `прошлый: ${formatMoney(prevStats.income, base, { compact: true })}` : undefined} />
        <MiniStat label="Расходы" value={formatMoney(stats.expense, base, { compact: true })} color="var(--color-danger)" sub={prevStats.expense > 0 ? `прошлый: ${formatMoney(prevStats.expense, base, { compact: true })}` : undefined} />
        <MiniStat label="Отложено" value={formatMoney(pos.saved, base, { compact: true })} color="var(--color-savings)" sub={stats.savings > 0 ? `в этом месяце: ${formatMoney(stats.savings, base, { compact: true })}` : 'накопительные счёта'} />
        <MiniStat label="Свободно" value={formatMoney(freeMoney, base, { compact: true })} color="var(--color-transfer)" sub={`savings rate ${formatPercent(stats.savingsRate * 100)}`} />
      </div>

      {/* Деньги сейчас */}
      <div>
        <SectionTitle action={<button className="text-accent text-[13px]" onClick={() => setTab('more')}>Все счета</button>}>Деньги сейчас</SectionTitle>
        <Card className="py-2">
          {pos.liquidAccounts.length === 0 && <p className="text-faint text-sm py-3 text-center">Пока нет счетов — добавьте в разделе «Счета»</p>}
          {pos.liquidAccounts.slice(0, 5).map(({ account, value, valueBase }) => (
            <div key={account.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
              <div className="min-w-0">
                <div className="text-[15px] truncate">{account.name}</div>
                <div className="text-[12px] text-faint">{account.currency}{valueBase !== value ? ` · ${formatMoney(valueBase, base, { compact: true })}` : ''}</div>
              </div>
              <div className="num font-semibold text-[15px]">{formatMoney(value, account.currency)}</div>
            </div>
          ))}
          {pos.liquidAccounts.length > 1 && (
            <div className="flex justify-between pt-2.5 border-t border-border">
              <span className="text-muted text-sm">Всего</span>
              <span className="num font-semibold">{formatMoney(pos.now, base)}</span>
            </div>
          )}
        </Card>
      </div>

      {/* График капитала */}
      <div>
        <SectionTitle>Капитал · 12 месяцев</SectionTitle>
        <Card>
          <LineChart
            points={series.map((p) => ({ value: p.value, label: p.key.slice(5) === '01' ? p.key.slice(2, 7) : '' }))}
            formatValue={(v) => formatNumberCompact(v)}
          />
        </Card>
      </div>

      {/* Быстрые действия */}
      <div>
        <SectionTitle>Быстрое действие</SectionTitle>
        <div className="grid grid-cols-4 gap-2">
          {ACTION_BUTTONS.map((b) => (
            <button
              key={b.type}
              onClick={() => openQuickAdd({ type: b.type })}
              className="flex flex-col items-center gap-1.5 bg-surface border border-border rounded-2xl py-3.5 active:opacity-75"
            >
              <span className="text-2xl">{b.emoji}</span>
              <span className="text-[12px] font-medium" style={{ color: b.color }}>{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Топ категорий */}
      {topCats.length > 0 && (
        <div>
          <SectionTitle action={<button className="text-accent text-[13px]" onClick={() => setTab('analytics')}>Аналитика</button>}>
            Расходы месяца
          </SectionTitle>
          <Card>
            <MiniBars
              items={topCats.map((x) => ({ label: `${x.category.emoji} ${x.category.name}`, value: x.total, color: x.category.color }))}
              formatValue={(v) => formatMoney(v, base, { compact: true })}
            />
          </Card>
        </div>
      )}

      {/* Инсайты */}
      {insights.length > 0 && (
        <div>
          <SectionTitle>Наблюдения</SectionTitle>
          <div className="flex flex-col gap-2">
            {insights.slice(0, 4).map((ins) => (
              <Card key={ins.id} className="flex gap-3 py-3.5">
                <span className="text-xl leading-none mt-0.5">{ins.emoji}</span>
                <p className="text-[14px] text-text/90 leading-snug">{ins.text}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeltaBadge({ label, value, base }: { label: string; value: number; base: string }) {
  const positive = value >= 0;
  return (
    <span
      className="text-[12px] px-2 py-1 rounded-lg font-medium num"
      style={{
        color: positive ? 'var(--color-accent)' : 'var(--color-danger)',
        backgroundColor: positive ? 'var(--color-accent-dim)' : 'var(--color-danger-dim)',
      }}
    >
      {positive ? '+' : '−'}{formatMoney(Math.abs(value), base, { compact: true })} {label}
    </span>
  );
}

function MiniStat({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <Card className="py-3">
      <div className="text-[12px] text-faint">{label}</div>
      <div className="num text-[19px] font-bold mt-0.5" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] text-faint mt-0.5 truncate">{sub}</div>}
    </Card>
  );
}
