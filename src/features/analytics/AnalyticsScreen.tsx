import { useState } from 'react';
import { Card, SectionTitle, TopBar } from '@/components/ui';
import { BarsChart, DonutChart, LineChart } from '@/components/charts';
import { computePosition, monthStats, monthlyInOutSeries, netWorthSeries } from '@/services/selectors';
import { useSnapshot } from '@/services/useSnapshot';
import { computeInsights } from '@/services/insights';
import { formatMoney, formatNumberCompact, convertMinor, ratesMap } from '@/lib/money';
import { currentMonthKey, formatMonthKey, daysInMonth, monthKeyAdd } from '@/lib/dates';

export function AnalyticsScreen() {
  const snap = useSnapshot();
  const [mKey, setMKey] = useState(currentMonthKey());

  if (!snap) return <div className="flex-1 flex items-center justify-center text-faint text-sm">Загрузка…</div>;

  const base = snap.baseCurrency;
  const rates = ratesMap(snap.rates);
  const stats = monthStats(snap, mKey);
  const prevStats = monthStats(snap, monthKeyAdd(mKey, -1));
  const isCurrent = mKey === currentMonthKey();
  const dayCount = isCurrent ? new Date().getDate() : daysInMonth(mKey);

  const inOut = monthlyInOutSeries(snap, 12);
  const nwSeries = netWorthSeries(snap, 12);
  const insights = computeInsights(snap, mKey);

  // сравнение года
  const year = mKey.slice(0, 4);
  const prevYear = String(Number(year) - 1);
  const ytdSum = (y: string) => {
    let income = 0, expense = 0, savings = 0;
    for (const t of snap.transactions) {
      if (!t.date.startsWith(y)) continue;
      const v = convertMinor(t.amount, t.currency, base, rates);
      if (t.type === 'income') income += v;
      else if (t.type === 'expense') expense += v;
      else if (t.type === 'savings') savings += v;
    }
    return { income, expense, savings };
  };
  const ytd = { thisYear: ytdSum(year), prevYear: ytdSum(prevYear) };

  // крупнейшие покупки месяца
  const topPurchases = stats.transactions
    .filter((t) => t.type === 'expense')
    .map((t) => ({ t, base: convertMinor(t.amount, t.currency, base, rates) }))
    .sort((a, b) => b.base - a.base)
    .slice(0, 5);

  const catById = new Map(snap.categories.map((c) => [c.id, c]));

  // MoM по категориям
  const prevByCat = new Map(prevStats.byCategoryExpense.map((x) => [x.category.id, x.total]));
  const momRows = stats.byCategoryExpense.slice(0, 8).map((x) => {
    const prev = prevByCat.get(x.category.id) ?? 0;
    return { cat: x.category, now: x.total, prev, delta: prev > 0 ? (x.total - prev) / prev : null };
  });

  const pos = computePosition(snap);

  return (
    <div className="pb-24">
      <TopBar
        title="Аналитика"
        right={
          <div className="flex items-center gap-1">
            <button onClick={() => setMKey(monthKeyAdd(mKey, -1))} className="w-8 h-8 rounded-full bg-surface-2 text-muted">‹</button>
            <span className="text-[13px] text-muted w-24 text-center">{formatMonthKey(mKey)}</span>
            <button
              onClick={() => setMKey(monthKeyAdd(mKey, 1))}
              disabled={isCurrent}
              className="w-8 h-8 rounded-full bg-surface-2 text-muted disabled:opacity-30"
            >
              ›
            </button>
          </div>
        }
      />

      <div className="px-4 flex flex-col gap-5">
        {/* 1-2. Итоги месяца */}
        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="Доходы" value={formatMoney(stats.income, base, { compact: true })} color="var(--color-accent)" />
          <Stat label="Расходы" value={formatMoney(stats.expense, base, { compact: true })} color="var(--color-danger)" />
          <Stat label="Отложено" value={formatMoney(stats.savings, base, { compact: true })} color="var(--color-savings)" />
          <Stat label="Savings rate" value={formatPercentSafe(stats.income, stats.expense)} color="var(--color-transfer)" />
        </div>

        {/* 3. По месяцам */}
        <div>
          <SectionTitle>Доходы и расходы · 12 месяцев</SectionTitle>
          <Card>
            <BarsChart
              bars={inOut.map((b) => ({ label: b.key.slice(5), income: b.income, expense: b.expense }))}
              formatValue={(v) => formatNumberCompact(v)}
            />
          </Card>
        </div>

        {/* 4. Расходы по категориям */}
        <div>
          <SectionTitle>Расходы по категориям</SectionTitle>
          <Card>
            {stats.byCategoryExpense.length === 0 ? (
              <p className="text-faint text-sm text-center py-6">Нет расходов за {formatMonthKey(mKey).toLowerCase()}</p>
            ) : (
              <div className="flex flex-col gap-3">
                <DonutChart
                  slices={stats.byCategoryExpense.slice(0, 6).map((x) => ({ value: x.total, color: x.category.color ?? '#64748b', label: x.category.name }))}
                  centerValue={formatMoney(stats.expense, base, { compact: true })}
                  centerLabel="расходы"
                />
                <div className="flex flex-col gap-2">
                  {stats.byCategoryExpense.slice(0, 6).map((x) => (
                    <div key={x.category.id} className="flex items-center gap-2 text-[14px]">
                      <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: x.category.color }} />
                      <span className="flex-1 truncate">{x.category.emoji} {x.category.name}</span>
                      <span className="text-faint num">{Math.round(x.share * 100)}%</span>
                      <span className="num font-medium w-24 text-right">{formatMoney(x.total, base, { compact: true })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* 5. Доходы по источникам */}
        {stats.byCategoryIncome.length > 0 && (
          <div>
            <SectionTitle>Доходы по источникам</SectionTitle>
            <Card>
              <div className="flex flex-col gap-2.5">
                {stats.byCategoryIncome.map((x) => (
                  <div key={x.category.id} className="flex items-center gap-2 text-[14px]">
                    <span>{x.category.emoji}</span>
                    <span className="flex-1">{x.category.name}</span>
                    <span className="text-faint num">{Math.round(x.share * 100)}%</span>
                    <span className="num font-medium w-24 text-right">{formatMoney(x.total, base, { compact: true })}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* 6. Net worth */}
        <div>
          <SectionTitle>Изменение капитала</SectionTitle>
          <Card>
            <LineChart
              points={nwSeries.map((p) => ({ value: p.value, label: p.key.slice(5) === '01' ? p.key.slice(2, 7) : '' }))}
              formatValue={(v) => formatNumberCompact(v)}
            />
            <div className="flex justify-between mt-3 text-[13px] text-muted">
              <span>Активы: <b className="num text-text">{formatMoney(pos.assets, base, { compact: true })}</b></span>
              <span>Долги: <b className="num text-danger">{formatMoney(pos.liabilities, base, { compact: true })}</b></span>
            </div>
          </Card>
        </div>

        {/* 7-8. Средние в день */}
        <div className="grid grid-cols-2 gap-2.5">
          <Stat label={`Расход в день · ${dayCount} дн.`} value={formatMoney(Math.round(stats.expense / dayCount), base, { compact: true })} color="var(--color-danger)" />
          <Stat label="Доход в день" value={formatMoney(Math.round(stats.income / dayCount), base, { compact: true })} color="var(--color-accent)" />
        </div>

        {/* 10. Крупнейшие покупки */}
        {topPurchases.length > 0 && (
          <div>
            <SectionTitle>Крупнейшие траты месяца</SectionTitle>
            <Card className="!py-1">
              {topPurchases.map(({ t, base: b }, i) => (
                <div key={t.id} className={`flex items-center gap-3 py-2.5 ${i < topPurchases.length - 1 ? 'border-b border-border' : ''}`}>
                  <span className="text-faint num text-sm w-4">{i + 1}</span>
                  <span className="flex-1 truncate text-[14px]">{t.description?.trim() || (t.categoryId ? catById.get(t.categoryId)?.name : '') || 'Без описания'}</span>
                  <span className="num font-medium text-[14px]">{formatMoney(b, base, { compact: true })}</span>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* 11. Сравнение с прошлым месяцем */}
        <div>
          <SectionTitle>К прошлому месяцу</SectionTitle>
          <Card>
            <div className="flex justify-between text-[14px] pb-2.5 border-b border-border">
              <span className="text-muted">Расходы</span>
              <span className="num">
                {formatMoney(stats.expense, base, { compact: true })}{' '}
                {prevStats.expense > 0 && (
                  <b style={{ color: stats.expense > prevStats.expense ? 'var(--color-danger)' : 'var(--color-accent)' }}>
                    {stats.expense >= prevStats.expense ? '+' : '−'}{Math.round(Math.abs((stats.expense - prevStats.expense) / prevStats.expense) * 100)}%
                  </b>
                )}
              </span>
            </div>
            {momRows.filter((r) => r.delta !== null).length === 0 && momRows.length === 0 && (
              <p className="text-faint text-sm py-3 text-center">Нет данных</p>
            )}
            {momRows.map((r) => (
              <div key={r.cat.id} className="flex justify-between items-center py-2 text-[14px]">
                <span className="truncate">{r.cat.emoji} {r.cat.name}</span>
                <span className="flex gap-3 items-baseline">
                  <span className="num text-faint">{formatMoney(r.now, base, { compact: true })}</span>
                  {r.delta !== null && (
                    <b className="num w-12 text-right" style={{ color: r.delta > 0 ? 'var(--color-danger)' : 'var(--color-accent)' }}>
                      {r.delta > 0 ? '+' : '−'}{Math.round(Math.abs(r.delta) * 100)}%
                    </b>
                  )}
                </span>
              </div>
            ))}
          </Card>
        </div>

        {/* 12. Сравнение годов */}
        <div>
          <SectionTitle>Год к году (с января)</SectionTitle>
          <Card className="!py-2">
            {([['Доходы', 'income'], ['Расходы', 'expense'], ['Накопления', 'savings']] as const).map(([label, key]) => {
              const now = ytd.thisYear[key];
              const prev = ytd.prevYear[key];
              const delta = prev > 0 ? (now - prev) / prev : null;
              return (
                <div key={key} className="flex justify-between items-center py-2 text-[14px] border-b border-border last:border-0">
                  <span className="text-muted">{label}</span>
                  <span className="flex gap-3 items-baseline">
                    <span className="num text-faint">{formatMoney(prev, base, { compact: true })}</span>
                    <span className="num font-semibold">{formatMoney(now, base, { compact: true })}</span>
                    {delta !== null && (
                      <b className="num w-14 text-right" style={{ color: key === 'expense' ? (delta > 0 ? 'var(--color-danger)' : 'var(--color-accent)') : delta > 0 ? 'var(--color-accent)' : 'var(--color-danger)' }}>
                        {delta > 0 ? '+' : '−'}{Math.round(Math.abs(delta) * 100)}%
                      </b>
                    )}
                  </span>
                </div>
              );
            })}
          </Card>
        </div>

        {/* Инсайты */}
        {insights.length > 0 && (
          <div>
            <SectionTitle>Наблюдения за {formatMonthKey(mKey).toLowerCase()}</SectionTitle>
            <div className="flex flex-col gap-2">
              {insights.map((ins) => (
                <Card key={ins.id} className="flex gap-3 py-3.5">
                  <span className="text-xl leading-none mt-0.5">{ins.emoji}</span>
                  <p className="text-[14px] text-text/90 leading-snug">{ins.text}</p>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card className="py-3.5">
      <div className="text-[12px] text-faint">{label}</div>
      <div className="num text-[20px] font-bold mt-0.5" style={{ color }}>{value}</div>
    </Card>
  );
}

function formatPercentSafe(income: number, expense: number): string {
  if (income <= 0) return '—';
  return `${Math.round(((income - expense) / income) * 100)}%`;
}
