import { describe, expect, it } from 'vitest';
import { parseQuickInput } from './parse';
import type { ParserContext } from './types';
import { CATEGORY_SEEDS } from '@/db/seed';

const TODAY = '2026-10-23';

function makeContext(overrides?: Partial<ParserContext>): ParserContext {
  let order = 0;
  const categories = CATEGORY_SEEDS.map((s) => ({
    id: `cat_${s.kind}_${s.name}`,
    name: s.name,
    kind: s.kind,
    keywords: s.keywords,
    sortOrder: order++,
  }));
  return {
    baseCurrency: 'UZS',
    categories,
    accounts: [
      { id: 'acc_cash', name: 'Наличные', kind: 'cash', currency: 'USD' },
      { id: 'acc_card', name: 'Карта Uzcard', kind: 'card', currency: 'UZS' },
      { id: 'acc_savings', name: 'Сбережения', kind: 'savings', currency: 'UZS' },
    ],
    goals: [{ id: 'goal_america', name: 'Америка' }],
    lastAccountId: 'acc_card',
    today: TODAY,
    ...overrides,
  };
}

describe('extractAmount', () => {
  const ctx = makeContext();

  it('35к на еду → 35000 UZS (базовая валюта)', () => {
    const p = parseQuickInput('35к на еду', ctx);
    expect(p.amountMajor).toBe(35000);
    expect(p.currency).toBe('UZS');
  });

  it('«потратил 35к на еду» → расход, Еда', () => {
    const p = parseQuickInput('потратил 35к на еду', ctx);
    expect(p.type).toBe('expense');
    expect(p.amountMajor).toBe(35000);
    expect(p.categoryId).toBe('cat_expense_Еда');
  });

  it('«42000 такси» → расход без глагола, Транспорт', () => {
    const p = parseQuickInput('42000 такси', ctx);
    expect(p.type).toBe('expense');
    expect(p.amountMajor).toBe(42000);
    expect(p.categoryId).toBe('cat_expense_Транспорт');
  });

  it('«получил 500 долларов за работу» → доход 500 USD', () => {
    const p = parseQuickInput('получил 500 долларов за работу', ctx);
    expect(p.type).toBe('income');
    expect(p.amountMajor).toBe(500);
    expect(p.currency).toBe('USD');
  });

  it('«получил 500$» → доход 500 USD', () => {
    const p = parseQuickInput('получил 500$', ctx);
    expect(p.type).toBe('income');
    expect(p.amountMajor).toBe(500);
    expect(p.currency).toBe('USD');
  });

  it('«$100 за парковку» → 100 USD', () => {
    const p = parseQuickInput('$100 за парковку', ctx);
    expect(p.amountMajor).toBe(100);
    expect(p.currency).toBe('USD');
    expect(p.type).toBe('expense');
  });

  it('«отложил 100 долларов на Америку» → накопление к цели', () => {
    const p = parseQuickInput('отложил 100 долларов на Америку', ctx);
    expect(p.type).toBe('savings');
    expect(p.amountMajor).toBe(100);
    expect(p.currency).toBe('USD');
    expect(p.goalId).toBe('goal_america');
    expect(p.categoryId).toBeNull();
  });

  it('«купил наушники за 40 долларов» → расход + имя покупки', () => {
    const p = parseQuickInput('купил наушники за 40 долларов', ctx);
    expect(p.type).toBe('expense');
    expect(p.amountMajor).toBe(40);
    expect(p.currency).toBe('USD');
    expect(p.purchaseName).toBe('наушники');
    expect(p.categoryId).toBe('cat_expense_Техника');
  });

  it('«2 миллиона сумов» → 2 000 000 UZS', () => {
    const p = parseQuickInput('получил 2 миллиона сумов за работу', ctx);
    expect(p.amountMajor).toBe(2_000_000);
    expect(p.currency).toBe('UZS');
  });

  it('«1 500 000» с пробелами → 1500000', () => {
    const p = parseQuickInput('потратил 1 500 000 на ремонт', ctx);
    expect(p.amountMajor).toBe(1_500_000);
  });

  it('«12,5» десятичная запятая → 12.5', () => {
    const p = parseQuickInput('потратил 12,5 на кофе', ctx);
    expect(p.amountMajor).toBe(12.5);
  });

  it('«35 тыс долларов» раздельные токены → 35000 USD', () => {
    const p = parseQuickInput('получил 35 тыс долларов', ctx);
    expect(p.amountMajor).toBe(35000);
    expect(p.currency).toBe('USD');
  });

  it('«1.5m» → 1 500 000', () => {
    const p = parseQuickInput('получил 1.5m сумов', ctx);
    expect(p.amountMajor).toBe(1_500_000);
  });

  it('«вчера потратил 85 тысяч на такси» → дата вчера, транспорт', () => {
    const p = parseQuickInput('вчера потратил 85 тысяч на такси', ctx);
    expect(p.date).toBe('2026-10-22');
    expect(p.amountMajor).toBe(85000);
    expect(p.categoryId).toBe('cat_expense_Транспорт');
  });

  it('«3 октября потратил 50к» → дата 2026-10-03', () => {
    const p = parseQuickInput('3 октября потратил 50к на еду', ctx);
    expect(p.date).toBe('2026-10-03');
  });

  it('«с карты на наличные 100$» → перевод без категории', () => {
    const p = parseQuickInput('перевел с карты на наличные 100$', ctx);
    expect(p.type).toBe('transfer');
    expect(p.accountId).toBe('acc_card');
    expect(p.toAccountId).toBe('acc_cash');
    expect(p.categoryId).toBeNull();
    expect(p.amountMajor).toBe(100);
  });

  it('«зарплата 5 млн» → доход, категория Зарплата', () => {
    const p = parseQuickInput('зарплата 5 млн', ctx);
    expect(p.type).toBe('income');
    expect(p.amountMajor).toBe(5_000_000);
    expect(p.categoryId).toBe('cat_income_Зарплата');
  });

  it('«кофе 25к» → Еда', () => {
    const p = parseQuickInput('кофе 25к', ctx);
    expect(p.categoryId).toBe('cat_expense_Еда');
  });

  it('без суммы → missing: amount', () => {
    const p = parseQuickInput('потратил на еду', ctx);
    expect(p.missing).toContain('amount');
  });

  it('«100€» → EUR', () => {
    const p = parseQuickInput('потратил 100€ на еду', ctx);
    expect(p.currency).toBe('EUR');
    expect(p.amountMajor).toBe(100);
  });

  it('описание сохраняет исходный текст', () => {
    const p = parseQuickInput('Потратил 35к на еду', ctx);
    expect(p.description).toBe('Потратил 35к на еду');
  });

  it('«1010сум» слитно → 1010 UZS', () => {
    const p = parseQuickInput('потратил 1010сум на еду', ctx);
    expect(p.type).toBe('expense');
    expect(p.amountMajor).toBe(1010);
    expect(p.currency).toBe('UZS');
  });

  it('«500долларов» слитно → 500 USD', () => {
    const p = parseQuickInput('получил 500долларов за работу', ctx);
    expect(p.amountMajor).toBe(500);
    expect(p.currency).toBe('USD');
  });

  it('«35к» по-прежнему множитель, а не валюта', () => {
    const p = parseQuickInput('потратил 35к на еду', ctx);
    expect(p.amountMajor).toBe(35000);
    expect(p.currency).toBe('UZS');
  });

  it('«обменял 1 миллион на доллары» → перевод на USD-счёт', () => {
    const p = parseQuickInput('обменял 1 миллион на доллары', ctx);
    expect(p.type).toBe('transfer');
    expect(p.amountMajor).toBe(1_000_000);
    expect(p.toAccountId).toBe('acc_cash');
  });

  it('«поменял 100 долларов на сумы» → перевод', () => {
    const p = parseQuickInput('поменял 100 долларов на сумы', ctx);
    expect(p.type).toBe('transfer');
    expect(p.amountMajor).toBe(100);
    expect(p.currency).toBe('USD');
  });

  it('цель с привязанным счётом подставляет счёт назначения', () => {
    const ctx2 = makeContext({
      goals: [{ id: 'goal_america', name: 'Америка', linkedAccountId: 'acc_savings' }],
    });
    const p = parseQuickInput('отложил 100 долларов на Америку', ctx2);
    expect(p.toAccountId).toBe('acc_savings');
  });
});
