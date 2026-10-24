import { addDays, fromISO, toISO } from '@/lib/dates';

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** винительный падеж для «в пятницу» */
const WEEKDAYS_ACC: Record<string, number> = {
  'понедельник': 1, 'вторник': 2, 'среду': 3, 'четверг': 4, 'пятницу': 5, 'субботу': 6, 'воскресенье': 0,
};

export interface DateMatch {
  date: string;
  start: number;
  end: number;
}

/** Ищет дату в тексте и возвращает её вместе с координатами, чтобы вырезать из строки. */
export function extractDate(text: string, today: string): DateMatch | null {
  const lower = text.toLowerCase();

  // сегодня / вчера / позавчера / today / yesterday
  const simple: Array<[RegExp, number]> = [
    [/(?<![\p{L}])позавчера(?![\p{L}])/u, -2],
    [/(?<![\p{L}])вчера(?![\p{L}])/u, -1],
    [/(?<![\p{L}])сегодня(?![\p{L}])/u, 0],
    [/(?<![\p{L}])yesterday(?![\p{L}])/u, -1],
    [/(?<![\p{L}])today(?![\p{L}])/u, 0],
  ];
  for (const [re, offset] of simple) {
    const m = re.exec(lower);
    if (m) {
      return { date: addDays(today, offset), start: m.index, end: m.index + m[0].length };
    }
  }

  // «3 октября», «3 окт», «23 февраля 2026»
  const monthPattern = MONTHS_GEN.map(escapeRe).join('|') + '|' + MONTHS_SHORT.map(escapeRe).join('|');
  const dayMonth = new RegExp(`\\b(\\d{1,2})[ -]?(?:(${monthPattern})\\p{L}*)(?:[ ,]+(\\d{4}))?`, 'iu');
  const dm = dayMonth.exec(text);
  if (dm) {
    const day = parseInt(dm[1], 10);
    const monthWord = dm[2].toLowerCase();
    let month = MONTHS_GEN.findIndex((mm) => monthWord.startsWith(mm));
    if (month < 0) month = MONTHS_SHORT.findIndex((mm) => monthWord.startsWith(mm));
    const year = dm[3] ? parseInt(dm[3], 10) : null;
    const iso = makeISO(year, month, day, today);
    if (iso) return { date: iso, start: dm.index, end: dm.index + dm[0].length };
  }

  // «03.10», «3.10.2026», «3/10»
  const numeric = /(?:^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s|$|[),.])/g;
  let nm: RegExpExecArray | null;
  while ((nm = numeric.exec(text)) !== null) {
    const day = parseInt(nm[1], 10);
    const month = parseInt(nm[2], 10) - 1;
    if (day < 1 || day > 31 || month < 0 || month > 11) continue;
    let year: number | null = null;
    if (nm[3]) {
      year = parseInt(nm[3], 10);
      if (year < 100) year += 2000;
    }
    const iso = makeISO(year, month, day, today);
    if (iso) {
      const start = nm.index + (nm[0].startsWith(' ') ? 1 : 0);
      return { date: iso, start, end: nm.index + nm[0].length };
    }
  }

  // «в пятницу», «в среду» — ближайший прошедший будний день
  const wd = /(?:^|[^а-яё])в (понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)(?![а-яё])/iu.exec(lower);
  if (wd) {
    const target = WEEKDAYS_ACC[wd[1].toLowerCase()];
    if (target !== undefined) {
      const todayDate = fromISO(today);
      let diff = (todayDate.getDay() - target + 7) % 7;
      if (diff === 0) diff = 7;
      const iso = addDays(today, -diff);
      return { date: iso, start: wd.index, end: wd.index + wd[0].length };
    }
  }

  return null;
}

function makeISO(explicitYear: number | null, month: number, day: number, today: string): string | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const year = explicitYear ?? fromISO(today).getFullYear();
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return null;
  let iso = toISO(d);
  // дата без года в далёком будущем (>180 дней) — почти наверняка прошлое, откатываем на год
  if (explicitYear === null && iso > today) {
    const diffDays = (fromISO(iso).getTime() - fromISO(today).getTime()) / 86_400_000;
    if (diffDays > 180) iso = toISO(new Date(year - 1, month, day));
  }
  return iso;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
