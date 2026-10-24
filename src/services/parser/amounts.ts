import type { AmountMatch } from './types';

/** Слова-множители: «35к», «2 млн», «35 тысяч», «1.5m» */
const MULTIPLIERS: Array<[RegExp, number]> = [
  [/^(млн|миллион|миллиона|миллионов|м|m)$/u, 1_000_000],
  [/^(тыс|тыс\.|тысяч|тысячи|тысячей|k|к)$/u, 1_000],
];

/** Валютные слова: «долларов», «сумов», «usd», «евро»… */
const CURRENCY_WORDS: Array<[RegExp, string]> = [
  [/^(usd|доллар\p{L}*|дол\.|бакс\p{L}*|зеленых|green)$/u, 'USD'],
  [/^(uzs|som|so'm|сом|сум|сума|сумов|сумам)$/u, 'UZS'],
  [/^(eur|евро)$/u, 'EUR'],
  [/^(rub|руб\.|рубл\p{L}*)$/u, 'RUB'],
  [/^(gbp|фунт\p{L}*)$/u, 'GBP'],
  [/^(kzt|тенге)$/u, 'KZT'],
  [/^(try|лир\p{L}*)$/u, 'TRY'],
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  '$': 'USD', '€': 'EUR', '₽': 'RUB', '£': 'GBP', '₸': 'KZT',
};

export function currencyFromWord(word: string): string | null {
  const w = word.toLowerCase();
  if (CURRENCY_SYMBOLS[w]) return CURRENCY_SYMBOLS[w];
  for (const [re, code] of CURRENCY_WORDS) {
    if (re.test(w)) return code;
  }
  return null;
}

function multiplierFromWord(word: string): number | null {
  const w = word.toLowerCase();
  for (const [re, mult] of MULTIPLIERS) {
    if (re.test(w)) return mult;
  }
  return null;
}

/**
 * Разбор одного токена-числа: "35к", "$100", "100$", "12,5", "1.500", "12500", "1 500 000"→последовательность токенов.
 * Возвращает major-число или null.
 */
function parseNumberToken(token: string): { major: number } | null {
  let s = token;
  // срезаем валютные символы по краям
  s = s.replace(/^[$€₽£₸]/, '').replace(/[$€₽£₸]$/, '');
  if (!/\d/.test(s)) return null;
  if (!/^[\d.,]+$/.test(s)) return null;

  // «1 500 000» / «1,500,000» / «1.500.000» — тысячи разделителями
  if (/^\d{1,3}([ ,.]\d{3})+$/.test(s)) {
    return { major: parseInt(s.replace(/[ ,.]/g, ''), 10) };
  }
  // десятичная дробь «12,5» / «12.5»
  if (/^\d+[.,]\d+$/.test(s)) {
    return { major: parseFloat(s.replace(',', '.')) };
  }
  if (/^\d+$/.test(s)) {
    return { major: parseInt(s, 10) };
  }
  return null;
}

/** Число с приставкой/множителем в одном токене: «35к», «2млн», «$100», «100$».
 *  Возвращает базу БЕЗ множителя — он применяется в основном цикле. */
function parseCompoundToken(token: string): { base: number; mult: number | null; currency: string | null } | null {
  const m = token.match(/^([$€₽£₸])?(\d+(?:[.,]\d+)?)(к|k|тыс|тысяч|млн|миллион|м|m)?([$€₽£₸])?$/iu);
  if (!m) return null;
  const [, prefixSym, numPart, multPart, suffixSym] = m;
  const base = parseFloat(numPart.replace(',', '.'));
  if (!Number.isFinite(base)) return null;
  let mult: number | null = null;
  if (multPart) {
    const low = multPart.toLowerCase();
    mult = /^(млн|миллион|м|m)$/.test(low) ? 1_000_000 : 1_000;
  }
  let currency: string | null = null;
  if (prefixSym) currency = CURRENCY_SYMBOLS[prefixSym];
  else if (suffixSym) currency = CURRENCY_SYMBOLS[suffixSym];
  return { base, mult, currency };
}

/**
 * Ищет первую денежную сумму в тексте.
 * Понимает: «35к на еду», «500$», «$100», «2 миллиона сумов», «1 500 000», «12,5», «35 тыс долларов», «1.5m».
 */
export function extractAmount(text: string, fallbackCurrency?: string): AmountMatch | null {
  const tokens: Array<{ word: string; start: number }> = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ word: m[0], start: m.index });
  }

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i].word;
    const start = tokens[i].start;
    const word = raw.replace(/^[.,;:("«]+/, '').replace(/[.,;:)"»]+$/, '');
    if (!word) continue;
    let base: number | null = null;
    let mult: number | null = null;
    let currency: string | null = null;
    let j = i + 1;

    const compound = parseCompoundToken(word);
    if (compound) {
      base = compound.base;
      mult = compound.mult;
      currency = compound.currency;
    } else {
      const num = parseNumberToken(word);
      if (!num) continue;
      base = num.major;
    }

    // «12 500 000» — разряды, разделённые пробелами (только когда множителя ещё нет)
    if (mult === null) {
      while (j < tokens.length && /^\d{3}$/.test(tokens[j].word) && base < 10_000_000) {
        base = base * 1000 + parseInt(tokens[j].word, 10);
        j++;
      }
    }

    // следующие токены: множитель и/или валюта (до двух слов)
    for (let step = 0; step < 2 && j < tokens.length; step++) {
      const nextWord = tokens[j].word.toLowerCase().replace(/[.,!?;)]+$/, '');
      if (mult === null) {
        const mm = multiplierFromWord(nextWord);
        if (mm) {
          mult = mm;
          j++;
          continue;
        }
      }
      if (currency === null) {
        const cc = currencyFromWord(nextWord);
        if (cc) {
          currency = cc;
          j++;
          continue;
        }
      }
      break;
    }

    if (base === null) continue;
    const lastTok = tokens[Math.min(j - 1, tokens.length - 1)];
    const end = lastTok.start + lastTok.word.length;
    return {
      major: base * (mult ?? 1),
      currency: currency ?? fallbackCurrency ?? null,
      start,
      end,
    };
  }
  return null;
}
