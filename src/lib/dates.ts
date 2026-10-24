/** Даты хранятся как ISO-строки 'YYYY-MM-DD' (локальные, без времени). */

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function addMonths(iso: string, months: number): string {
  const d = fromISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toISO(d);
}

export function addYears(iso: string, years: number): string {
  return addMonths(iso, years * 12);
}

/** 'YYYY-MM' для транзакций */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function currentMonthKey(): string {
  return todayISO().slice(0, 7);
}

export function monthKeyAdd(key: string, months: number): string {
  return addMonths(`${key}-01`, months).slice(0, 7);
}

export function monthStart(key: string): string {
  return `${key}-01`;
}

export function monthEnd(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${key}-${String(last).padStart(2, '0')}`;
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

const MONTHS_NOM = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];
const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** '2026-10' → 'Октябрь 2026' */
export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const name = MONTHS_NOM[m - 1] ?? '';
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  return `${capitalized} ${y}`;
}

/** '2026-10-07' → '7 октября' (год — если не текущий) */
export function formatDay(iso: string, opts?: { withWeekday?: boolean }): string {
  const d = fromISO(iso);
  const day = d.getDate();
  const month = MONTHS_GEN[d.getMonth()];
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  let s = `${day} ${month}${year}`;
  if (opts?.withWeekday) {
    const wd = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'][d.getDay()];
    s += `, ${wd}`;
  }
  return s;
}

/** Человеческая подпись дня относительно сегодня: Сегодня / Вчера / 7 октября */
export function formatDayRelative(iso: string): string {
  const t = todayISO();
  if (iso === t) return 'Сегодня';
  if (iso === addDays(t, -1)) return 'Вчера';
  if (iso === addDays(t, -2)) return 'Позавчера';
  return formatDay(iso, { withWeekday: true });
}

export function formatPercent(v: number, digits = 0): string {
  return `${v.toFixed(digits).replace('.', ',')}%`;
}

export function formatDelta(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
}

/** Прошло ли N дней с даты */
export function daysSince(iso: string): number {
  const diff = fromISO(todayISO()).getTime() - fromISO(iso).getTime();
  return Math.round(diff / 86_400_000);
}

export function monthDiff(fromKey: string, toKey: string): number {
  const [fy, fm] = fromKey.split('-').map(Number);
  const [ty, tm] = toKey.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}
