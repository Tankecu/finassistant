import type { TxType } from '@/db/db';
import { extractAmount } from './amounts';
import { extractDate } from './dates';
import type { ParserContext, ParsedOp } from './types';

export type { ParserContext, ParsedOp } from './types';

const EXPENSE_VERBS_FINAL = [
  'потратил', 'потратила', 'потратили', 'тратил', 'тратила', 'платил', 'платила',
  'заплатил', 'заплатила', 'оплатил', 'оплатила', 'потрачено', 'ушло', 'spent', 'paid', 'bought', 'buy',
];
const INCOME_VERBS = [
  'получил', 'получила', 'получили', 'заработал', 'заработала', 'заработали', 'пришло', 'пришел',
  'выплатили', 'начислили', 'received', 'got', 'earned',
];
const SAVINGS_VERBS = ['отложил', 'отложила', 'отложили', 'накопил', 'накопила', 'накопили', 'сохранил', 'saved', 'save'];
const TRANSFER_VERBS = ['перевел', 'перевела', 'перевели', 'перекинул', 'перекинула', 'обменял', 'обменяла', 'обменяли', 'поменял', 'поменяла', 'трансфер', 'transferred', 'moved', 'exchange'];

function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordIncludes(text: string, word: string): boolean {
  const re = new RegExp(`(^|[^\\p{L}])${escapeRe(word)}([^\\p{L}]|$)`, 'u');
  return re.test(text);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectType(norm: string): TxType | null {
  for (const v of TRANSFER_VERBS) if (wordIncludes(norm, v)) return 'transfer';
  for (const v of SAVINGS_VERBS) if (wordIncludes(norm, v)) return 'savings';
  for (const v of EXPENSE_VERBS_FINAL) if (wordIncludes(norm, v)) return 'expense';
  for (const v of INCOME_VERBS) if (wordIncludes(norm, v)) return 'income';
  // существительные-подсказки
  if (wordIncludes(norm, 'зарплата') || wordIncludes(norm, 'зарплату') || wordIncludes(norm, 'премия') || wordIncludes(norm, 'аванс')) return 'income';
  if (wordIncludes(norm, 'аренда') || wordIncludes(norm, 'аренду') || wordIncludes(norm, 'подписка')) return 'expense';
  return null;
}

/** «купил наушники за 40 долларов» → «наушники» */
function extractPurchaseName(norm: string): string | null {
  const re = /(?:^|\s)(?:купил|купила|купили|купить|bought)\s+([^\d$€₽].*?)(?=\s+(?:за|по|в|на|для|это|стоит)(?![\p{L}])|\s*[$€₽₸]|\s+\d|$)/u;
  const m = re.exec(norm);
  if (!m) return null;
  const name = m[1].trim().replace(/[.,;!?]+$/, '');
  if (!name || name.length < 2 || name.length > 60) return null;
  return name;
}

interface AccountMention {
  accountId: string;
  role: 'from' | 'to';
  index: number;
}

const KIND_HINTS: Array<{ re: RegExp; kind: string }> = [
  { re: /карт/, kind: 'card' },
  { re: /наличн|кэш|нал(?![\p{L}])/u, kind: 'cash' },
  { re: /сбер|банк/, kind: 'bank' },
  { re: /накоплени/, kind: 'savings' },
  { re: /кошелек|кошелёк|wallet/, kind: 'ewallet' },
];

function findAccountMentions(norm: string, ctx: ParserContext): AccountMention[] {
  const mentions: AccountMention[] = [];
  const seen = new Set<string>();

  const push = (accountId: string, role: 'from' | 'to', index: number) => {
    const key = `${accountId}:${role}`;
    if (seen.has(key)) return;
    seen.add(key);
    mentions.push({ accountId, role, index });
  };

  for (const acc of ctx.accounts) {
    const name = acc.name.toLowerCase().replace(/ё/g, 'е');
    if (name.length < 3) continue;
    let idx = norm.indexOf(name);
    while (idx !== -1) {
      const before = norm.slice(Math.max(0, idx - 4), idx);
      if (/(с|со|из|from)\s$/u.test(before)) push(acc.id, 'from', idx);
      else if (/(на|в|to)\s$/u.test(before)) push(acc.id, 'to', idx);
      else push(acc.id, 'to', idx);
      idx = norm.indexOf(name, idx + name.length);
    }
  }

  // подсказки по типу счёта: «с карты», «наличными»
  if (mentions.length === 0) {
    for (const hint of KIND_HINTS) {
      const m = hint.re.exec(norm);
      if (!m) continue;
      const acc = ctx.accounts.find((a) => a.kind === hint.kind);
      if (!acc) continue;
      const before = norm.slice(Math.max(0, m.index - 4), m.index);
      const role = /(с|со|из|from)\s$/u.test(before) ? 'from' : 'to';
      push(acc.id, role, m.index);
    }
  }
  return mentions;
}

function matchGoal(norm: string, ctx: ParserContext): string | null {
  let best: { id: string; len: number } | null = null;
  for (const goal of ctx.goals) {
    const name = goal.name.toLowerCase().replace(/ё/g, 'е');
    if (name.length < 3) continue;
    // точное вхождение или усечённая основа («Америка» → «на Америку»)
    const candidates: Array<[string, number]> = [[name, name.length]];
    if (name.length >= 5) candidates.push([name.slice(0, -2), name.length - 2]);
    else if (name.length >= 4) candidates.push([name.slice(0, -1), name.length - 1]);
    for (const [cand, len] of candidates) {
      if (len < 3) continue;
      if (norm.includes(cand) && (!best || len > best.len)) {
        best = { id: goal.id, len };
      }
    }
  }
  return best?.id ?? null;
}

function matchCategory(
  norm: string,
  ctx: ParserContext,
  purchaseName: string | null,
): { id: string; kind: 'income' | 'expense' } | null {
  const haystacks = [purchaseName ?? '', norm].filter(Boolean);
  let best: { id: string; kind: 'income' | 'expense'; score: number; order: number } | null = null;

  for (const cat of ctx.categories) {
    let score = 0;
    for (const kw of cat.keywords) {
      const k = kw.toLowerCase().replace(/ё/g, 'е');
      if (!k) continue;
      for (const hay of haystacks) {
        if (wordIncludes(hay, k)) score += k.length;
      }
    }
    const nameLower = cat.name.toLowerCase().replace(/ё/g, 'е');
    for (const hay of haystacks) {
      if (wordIncludes(hay, nameLower)) score += nameLower.length + 2;
    }
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && cat.sortOrder < best.order)) {
      best = { id: cat.id, kind: cat.kind, score, order: cat.sortOrder };
    }
  }
  return best ? { id: best.id, kind: best.kind } : null;
}

/** «…на доллары / в сумы / to usd» → код валюты назначения. */
export function detectTargetCurrency(norm: string): string | null {
  const m = /(?:на|в|to|into)\s+(доллар\w*|бакс\w*|usd|сум\w*|som|uzs|евро|eur|рубл\w*|rub|тенге|kzt|лир\w*|try)/u.exec(norm);
  if (!m) return null;
  const w = m[1];
  if (/^(доллар|бакс|usd)/.test(w)) return 'USD';
  if (/^(сум|som|uzs)/.test(w)) return 'UZS';
  if (/^(евро|eur)/.test(w)) return 'EUR';
  if (/^(рубл|rub)/.test(w)) return 'RUB';
  if (/^(тенге|kzt)/.test(w)) return 'KZT';
  if (/^(лир|try)/.test(w)) return 'TRY';
  return null;
}

function findFallbackCategory(
  ctx: ParserContext,
  kind: 'income' | 'expense',
): string | null {
  const other = ctx.categories.find((c) => c.kind === kind && c.name.toLowerCase() === 'другое');
  return other?.id ?? ctx.categories.find((c) => c.kind === kind)?.id ?? null;
}

/**
 * «1010сум» → «1010 сум»: отделяем валютные слова, прилипшие к цифрам.
 * Множители (35к, 2млн) не трогаем — их разбирает extractAmount.
 */
function unglueCurrencyWords(text: string): string {
  return text.replace(
    /(\d)(сум\p{L}*|сом\p{L}*|доллар\p{L}*|бакс\p{L}*|евро|рубл\p{L}*|тенге|лир\p{L}*|фунт\p{L}*|usd|uzs|eur|rub|gbp|kzt|try)/giu,
    '$1 $2',
  );
}

/**
 * Главный парсер быстрого ввода.
 * «потратил 35к на еду» → expense 35 000, категория Еда.
 */
export function parseQuickInput(raw: string, ctx: ParserContext): ParsedOp {
  const norm = normalizeText(unglueCurrencyWords(raw));
  const today = ctx.today;

  // 1. дата
  let workText = norm;
  let date = today;
  const dateMatch = extractDate(norm, today);
  if (dateMatch) {
    date = dateMatch.date;
    workText = (norm.slice(0, dateMatch.start) + ' ' + norm.slice(dateMatch.end)).replace(/\s+/g, ' ').trim();
  }

  // 2. покупка (до вырезания суммы — объект покупки часто стоит перед ней)
  const purchaseName = extractPurchaseName(workText);

  // 3. сумма
  const amountMatch = extractAmount(workText, ctx.baseCurrency);

  // 4. тип по глаголам
  let type = detectType(norm);

  // 5. цель (для накоплений)
  const goalId = matchGoal(norm, ctx);

  // 6. счета
  const mentions = findAccountMentions(norm, ctx);
  let accountId: string | null = null;
  let toAccountId: string | null = null;
  if (type === 'transfer' || type === 'savings') {
    const from = mentions.find((m) => m.role === 'from');
    const to = mentions.find((m) => m.role === 'to' && (!from || m.accountId !== from.accountId));
    accountId = from?.accountId ?? ctx.lastAccountId ?? null;
    toAccountId = to?.accountId ?? null;
    // «обменял 1 млн на доллары» — счёт назначения ищем по валюте после «на»
    if (!toAccountId && type === 'transfer') {
      const targetCurrency = detectTargetCurrency(norm);
      if (targetCurrency) {
        const candidates = ctx.accounts.filter((a) => a.kind !== 'liability');
        const byCurrency = candidates.filter((a) => a.currency === targetCurrency && a.id !== accountId);
        if (byCurrency.length === 1) toAccountId = byCurrency[0].id;
      }
    }
  } else {
    const mention = mentions[0];
    accountId = mention?.accountId ?? ctx.lastAccountId ?? null;
  }

  // 7. категория (может подсказать тип, если глагола не было)
  const cat = matchCategory(norm, ctx, purchaseName);
  let categoryId: string | null = null;
  if (cat) {
    if (!type) type = cat.kind;
    if (type === cat.kind || type === 'transfer' || type === 'savings') {
      categoryId = cat.id;
    }
  }

  // 8. тип по умолчанию: есть цель → накопление; есть сумма → расход
  if (!type) {
    if (goalId) type = 'savings';
    else if (amountMatch) type = 'expense';
  }

  // 9. фолбэк-категория «Другое»
  if (!categoryId && (type === 'expense' || type === 'income')) {
    categoryId = findFallbackCategory(ctx, type);
  }

  // 10. накопление → счёт назначения из цели
  if (type === 'savings' && goalId) {
    const goal = ctx.goals.find((g) => g.id === goalId);
    if (goal?.linkedAccountId) toAccountId = goal.linkedAccountId;
  }

  const missing: ParsedOp['missing'] = [];
  if (amountMatch === null) missing.push('amount');
  if (type === null) missing.push('type');

  return {
    type,
    amountMajor: amountMatch?.major ?? null,
    currency: amountMatch?.currency ?? null,
    categoryId,
    accountId,
    toAccountId,
    goalId,
    date,
    purchaseName,
    description: raw.trim(),
    missing,
  };
}
