/**
 * Деньги хранятся в минорных единицах (целые числа).
 * UZS — без копеек (тийины на практике не используются), USD/EUR — центы.
 */

export interface CurrencyMeta {
  code: string;
  exp: number; // количество знаков после запятой
  symbol: string;
  name: string;
}

export const CURRENCIES: Record<string, CurrencyMeta> = {
  UZS: { code: 'UZS', exp: 0, symbol: 'сум', name: 'Узбекский сум' },
  USD: { code: 'USD', exp: 2, symbol: '$', name: 'Доллар США' },
  EUR: { code: 'EUR', exp: 2, symbol: '€', name: 'Евро' },
  RUB: { code: 'RUB', exp: 2, symbol: '₽', name: 'Российский рубль' },
  GBP: { code: 'GBP', exp: 2, symbol: '£', name: 'Фунт стерлингов' },
  KZT: { code: 'KZT', exp: 2, symbol: '₸', name: 'Тенге' },
  TRY: { code: 'TRY', exp: 2, symbol: '₺', name: 'Турецкая лира' },
};

export const COMMON_CURRENCY_CODES = ['UZS', 'USD', 'EUR', 'RUB', 'GBP', 'KZT', 'TRY'];

export function currencyMeta(code: string): CurrencyMeta {
  return (
    CURRENCIES[code] ?? { code, exp: 2, symbol: code, name: code }
  );
}

export function expFactor(code: string): number {
  return 10 ** currencyMeta(code).exp;
}

/** major (например 35 000) → minor (35 000). Для USD 12.5 → 1250 */
export function toMinor(major: number, code: string): number {
  return Math.round(major * expFactor(code));
}

/** minor → major */
export function toMajor(minor: number, code: string): number {
  return minor / expFactor(code);
}

const nfCache = new Map<string, Intl.NumberFormat>();

function numberFormat(code: string, withFraction: boolean): Intl.NumberFormat {
  const key = `${code}:${withFraction}`;
  let nf = nfCache.get(key);
  if (!nf) {
    const meta = currencyMeta(code);
    nf = new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: withFraction ? meta.exp : 0,
      maximumFractionDigits: withFraction ? meta.exp : 0,
    });
    nfCache.set(key, nf);
  }
  return nf;
}

/** 3500000 UZS → "3 500 000 сум" | 1250 USD → "$12,50" */
export function formatMoney(minor: number, code: string, opts?: { compact?: boolean; sign?: 'auto' }): string {
  const meta = currencyMeta(code);
  const major = toMajor(minor, code);
  if (opts?.compact && Math.abs(major) >= 1_000_000) {
    return `${formatNumberCompact(major)} ${meta.code === 'UZS' ? '' : meta.symbol}`.trim() || `${formatNumberCompact(major)}`;
  }
  const abs = numberFormat(code, meta.exp > 0).format(Math.abs(major));
  const sign = major < 0 ? '−' : opts?.sign === 'auto' && major > 0 ? '+' : '';
  if (meta.code === 'UZS') return `${sign}${abs} сум`;
  if (meta.code === 'USD') return `${sign}$${abs}`;
  return `${sign}${abs} ${meta.symbol}`;
}

/** Короткая форма для графиков: 3,5 млн / 1,2 млн */
export function formatNumberCompact(major: number): string {
  const abs = Math.abs(major);
  const sign = major < 0 ? '−' : '';
  if (abs >= 1_000_000_000) return `${sign}${trimZeros((abs / 1_000_000_000).toFixed(1))} млрд`;
  if (abs >= 1_000_000) return `${sign}${trimZeros((abs / 1_000_000).toFixed(1))} млн`;
  if (abs >= 10_000) return `${sign}${trimZeros((abs / 1000).toFixed(1))} тыс`;
  return `${sign}${numberFormat('USD', false).format(major)}`;
}

function trimZeros(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s.replace('.', ',');
}

/** Парсинг числа из input: "12,5" / "12.5" / "1 500" / "35000" → minor */
export function parseAmountInput(input: string, code: string): number | null {
  const cleaned = input.replace(/\s|\u00a0/g, '').replace(/,/g, '.');
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const major = parseFloat(cleaned);
  if (!Number.isFinite(major) || major < 0) return null;
  return toMinor(major, code);
}

export interface RateLike {
  code: string;
  rate: number; // 1 единица валюты = rate единиц базовой
}

/**
 * Конвертация minor-суммы из одной валюты в другую.
 * rate хранится относительно базовой валюты: rate(base) === 1.
 */
export function convertMinor(
  minor: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): number {
  if (from === to) return minor;
  const rateFrom = rates[from];
  const rateTo = rates[to];
  if (!rateFrom || !rateTo) return minor; // без курса — оставляем как есть
  const baseMajor = toMajor(minor, from) * rateFrom;
  const targetMajor = baseMajor / rateTo;
  return toMinor(targetMajor, to);
}

export function ratesMap(list: RateLike[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of list) map[r.code] = r.rate;
  return map;
}
