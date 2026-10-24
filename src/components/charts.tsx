/** Минималистичные SVG-графики для мобильного экрана. Без зависимостей. */

export interface LinePoint {
  value: number;
  label?: string;
}

export function LineChart({
  points,
  height = 140,
  color = 'var(--color-accent)',
  formatValue,
}: {
  points: LinePoint[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const W = 320;
  const H = height;
  const PAD_Y = 14;
  if (points.length < 2) {
    return <div className="text-faint text-sm text-center py-8">Мало данных для графика</div>;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => PAD_Y + (1 - (v - min) / span) * (H - PAD_Y * 2);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${W},${H} L0,${H} Z`;
  const id = `grad-${Math.abs(min)}-${Math.round(max)}`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1={y(0)} x2={W} y2={y(0)} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 3" />
        <path d={area} fill={`url(#${id})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(points.length - 1)} cy={y(values[points.length - 1])} r="3.5" fill={color} />
      </svg>
      <div className="flex justify-between text-[11px] text-faint mt-1 px-0.5">
        <span>{points[0].label}</span>
        {formatValue && (
          <span className="text-muted">
            {formatValue(min)} … {formatValue(max)}
          </span>
        )}
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

export interface BarPair {
  label: string;
  income: number;
  expense: number;
}

export function BarsChart({ bars, height = 150, formatValue }: { bars: BarPair[]; height?: number; formatValue: (v: number) => string }) {
  const max = Math.max(...bars.map((b) => Math.max(b.income, b.expense)), 1);
  const showValue = (v: number) => (v > 0 ? formatValue(v) : '');
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {bars.map((b, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5 h-full" title={`${b.label}: ${showValue(b.income)} / ${showValue(b.expense)}`}>
            <div className="w-full flex items-end justify-center gap-[2px] flex-1">
              <div
                className="w-1/2 max-w-3 rounded-t bg-accent/85"
                style={{ height: `${(b.income / max) * 100}%`, minHeight: b.income > 0 ? 2 : 0 }}
              />
              <div
                className="w-1/2 max-w-3 rounded-t bg-danger/70"
                style={{ height: `${(b.expense / max) * 100}%`, minHeight: b.expense > 0 ? 2 : 0 }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1.5">
        {bars.map((b, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-faint leading-none">
            {b.label}
          </div>
        ))}
      </div>
      <div className="flex gap-4 justify-center mt-2 text-[11px] text-muted">
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-accent inline-block" /> доходы</span>
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-sm bg-danger/70 inline-block" /> расходы</span>
      </div>
    </div>
  );
}

export interface DonutSlice {
  value: number;
  color: string;
  label: string;
}

export function DonutChart({ slices, size = 148, centerLabel, centerValue }: { slices: DonutSlice[]; size?: number; centerLabel?: string; centerValue?: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 60;
  const C = 2 * Math.PI * R;
  let acc = 0;
  if (total <= 0) {
    return <div className="text-faint text-sm text-center py-8">Нет расходов за период</div>;
  }
  return (
    <div className="flex justify-center">
      <svg viewBox="0 0 160 160" style={{ width: size, height: size }}>
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="18" />
        {slices.map((s, i) => {
          const frac = s.value / total;
          const dash = `${frac * C} ${C}`;
          const offset = -acc * C;
          acc += frac;
          return (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="18"
              strokeDasharray={dash}
              strokeDashoffset={offset}
              transform="rotate(-90 80 80)"
              strokeLinecap="butt"
            />
          );
        })}
        {centerValue && (
          <text x="80" y="78" textAnchor="middle" fill="var(--color-text)" className="num" fontSize="15" fontWeight="700">
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text x="80" y="96" textAnchor="middle" fill="var(--color-faint)" fontSize="10">
            {centerLabel}
          </text>
        )}
      </svg>
    </div>
  );
}

export function MiniBars({ items, formatValue }: { items: Array<{ label: string; value: number; color?: string }>; formatValue: (v: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-base w-6 text-center">{it.color ? '' : ''}</span>
          <div className="flex-1">
            <div className="flex justify-between text-[13px] mb-1">
              <span className="text-text truncate max-w-[60%]">{it.label}</span>
              <span className="num text-muted">{formatValue(it.value)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, backgroundColor: it.color ?? 'var(--color-accent)' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
