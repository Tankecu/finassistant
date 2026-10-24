import type { CalcSnapshot } from './selectors';
import { monthStats } from './selectors';
import { formatMoney, convertMinor, ratesMap } from '@/lib/money';
import { monthKeyAdd, monthEnd, monthStart } from '@/lib/dates';

export interface Insight {
  id: string;
  emoji: string;
  text: string;
  priority: number;
}

/**
 * Автоматические наблюдения. Только факты, без советов и морали.
 */
export function computeInsights(snap: CalcSnapshot, mKey: string): Insight[] {
  const out: Insight[] = [];
  const base = snap.baseCurrency;
  const fmt = (minor: number) => formatMoney(minor, base, { compact: true });
  const rates = ratesMap(snap.rates);
  const toBase = (amount: number, currency: string) => convertMinor(amount, currency, base, rates);

  const cur = monthStats(snap, mKey);
  const prev = monthStats(snap, monthKeyAdd(mKey, -1));

  // 1. Динамика категорий MoM
  const prevByCat = new Map(prev.byCategoryExpense.map((x) => [x.category.id, x]));
  for (const item of cur.byCategoryExpense.slice(0, 8)) {
    const prevItem = prevByCat.get(item.category.id);
    if (!prevItem || prevItem.total <= 0) {
      if (item.total > 0 && prev.expense > 0 && item.total / cur.expense >= 0.1) {
        out.push({
          id: `cat-new-${item.category.id}`,
          emoji: item.category.emoji,
          text: `«${item.category.name}» появилась в расходах этого месяца: ${fmt(item.total)}.`,
          priority: 6,
        });
      }
      continue;
    }
    const delta = (item.total - prevItem.total) / prevItem.total;
    if (delta >= 0.25) {
      out.push({
        id: `cat-up-${item.category.id}`,
        emoji: item.category.emoji,
        text: `«${item.category.name}»: ${Math.round(delta * 100)}% больше, чем в прошлом месяце — ${fmt(item.total)} против ${fmt(prevItem.total)}.`,
        priority: 2,
      });
    } else if (delta <= -0.25) {
      out.push({
        id: `cat-down-${item.category.id}`,
        emoji: item.category.emoji,
        text: `«${item.category.name}»: на ${Math.round(-delta * 100)}% меньше, чем в прошлом месяце — ${fmt(item.total)} против ${fmt(prevItem.total)}.`,
        priority: 7,
      });
    }
  }

  // 2. Доля категории выросла
  for (const item of cur.byCategoryExpense.slice(0, 6)) {
    const prevItem = prevByCat.get(item.category.id);
    if (!prevItem || prev.expense <= 0) continue;
    const shift = item.share - prevItem.share;
    if (shift >= 0.05 && item.share >= 0.1) {
      out.push({
        id: `share-${item.category.id}`,
        emoji: '📊',
        text: `«${item.category.name}» занимает ${Math.round(item.share * 100)}% расходов против ${Math.round(prevItem.share * 100)}% месяц назад.`,
        priority: 4,
      });
    }
  }

  // 3. Savings rate
  if (cur.income > 0) {
    const rate = (cur.income - cur.expense) / cur.income;
    out.push({
      id: 'savings-rate',
      emoji: rate >= 0.2 ? '🌱' : '💰',
      text:
        rate >= 0
          ? `Накопления составляют ${Math.round(rate * 100)}% дохода за месяц.`
          : `Расходы превысили доходы на ${fmt(cur.expense - cur.income)} за месяц.`,
      priority: 1,
    });
  }

  // 4. Три крупнейшие траты месяца
  const topTx = cur.transactions
    .filter((t) => t.type === 'expense')
    .map((t) => ({ t, base: toBase(t.amount, t.currency) }))
    .sort((a, b) => b.base - a.base)
    .slice(0, 3);
  if (topTx.length >= 3 && topTx[2].base > 0) {
    const sum = topTx.reduce((s, x) => s + x.base, 0);
    const names = topTx.map((x) => x.t.description?.trim() || 'Без описания').join(', ');
    out.push({
      id: 'top-purchases',
      emoji: '🎯',
      text: `Три крупнейшие траты месяца — ${fmt(sum)}: ${names}.`,
      priority: 5,
    });
  }

  // 5. Необычно крупная трата: > 2× медианы категории за 90 дней
  const from90 = monthStart(monthKeyAdd(mKey, -2));
  const till90 = monthEnd(mKey);
  const byCat = new Map<string, number[]>();
  for (const t of snap.transactions) {
    if (t.type !== 'expense' || !t.categoryId || t.date < from90 || t.date > till90) continue;
    const list = byCat.get(t.categoryId) ?? [];
    list.push(toBase(t.amount, t.currency));
    byCat.set(t.categoryId, list);
  }
  for (const tx of cur.transactions.filter((t) => t.type === 'expense' && t.categoryId)) {
    const amounts = (byCat.get(tx.categoryId!) ?? []).filter((v) => v !== toBase(tx.amount, tx.currency));
    if (amounts.length < 4) continue;
    const sorted = [...amounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const amount = toBase(tx.amount, tx.currency);
    if (median > 0 && amount > median * 2) {
      const cat = snap.categories.find((c) => c.id === tx.categoryId);
      out.push({
        id: `unusual-${tx.id}`,
        emoji: '⚠️',
        text: `Необычно крупно для «${cat?.name ?? '—'}»: ${fmt(amount)} (${tx.description?.trim() || 'без описания'}) — вдвое больше обычного уровня ${fmt(median)}.`,
        priority: 3,
      });
      break; // одна такая карточка достаточно
    }
  }

  // 6. Повторяющиеся платежи (подписки)
  const months = [monthKeyAdd(mKey, -2), monthKeyAdd(mKey, -1), mKey];
  const descAmounts = new Map<string, number[]>();
  for (const m of months) {
    const st = monthStats(snap, m);
    for (const t of st.transactions) {
      if (t.type !== 'expense' || !t.description) continue;
      const key = t.description.trim().toLowerCase();
      descAmounts.set(key, [...(descAmounts.get(key) ?? []), toBase(t.amount, t.currency)]);
    }
  }
  for (const [desc, amounts] of descAmounts) {
    const monthsSeen = new Set<string>();
    for (const t of snap.transactions) {
      if (t.type === 'expense' && t.description?.trim().toLowerCase() === desc && months.includes(t.date.slice(0, 7))) {
        monthsSeen.add(t.date.slice(0, 7));
      }
    }
    if (monthsSeen.size >= 2 && amounts.length >= 2) {
      const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
      if (avg > 0) {
        out.push({
          id: `recurring-${desc.slice(0, 20)}`,
          emoji: '🔄',
          text: `«${desc}» платится ${monthsSeen.size} месяца подряд — в среднем ${fmt(avg)}/мес. Похоже на регулярный платёж.`,
          priority: 8,
        });
        break;
      }
    }
  }

  // 7. Прогноз целей
  for (const goal of snap.goals.filter((g) => g.status === 'active')) {
    const linked = goal.linkedAccountId
      ? snap.accounts.find((a) => a.id === goal.linkedAccountId)
      : undefined;
    let savedTotal = 0;
    let monthsWithSavings = new Set<string>();
    for (const t of snap.transactions) {
      if (t.type !== 'savings') continue;
      const match = t.goalId === goal.id || (linked && t.toAccountId === linked.id);
      if (!match) continue;
      savedTotal += toBase(t.amount, t.currency);
      monthsWithSavings.add(t.date.slice(0, 7));
    }
    if (monthsWithSavings.size === 0) continue;
    const target = toBase(goal.targetAmount, goal.currency);
    const avg = savedTotal / monthsWithSavings.size;
    if (avg <= 0 || target <= 0) continue;
    const progress = Math.min(savedTotal, target);
    const remaining = target - progress;
    const monthsLeft = Math.ceil(remaining / avg);
    const deadline = goal.deadline ? new Date(goal.deadline) : null;
    let text = `Цель «${goal.name}»: накоплено ${fmt(progress)} из ${fmt(target)}. При темпе ${fmt(Math.round(avg))}/мес цель будет достигнута примерно через ${monthsLeft} мес.`;
    if (deadline) {
      const eta = new Date();
      eta.setMonth(eta.getMonth() + monthsLeft);
      const onTime = eta <= deadline;
      text += onTime
        ? ` Успеваете к сроку (${formatMonthYear(goal.deadline!)}).`
        : ` Срок ${formatMonthYear(goal.deadline!)} — при таком темпе не успеть.`;
    }
    out.push({ id: `goal-${goal.id}`, emoji: '🎯', text, priority: 3 });
  }

  return out.sort((a, b) => a.priority - b.priority).slice(0, 7);
}

function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
