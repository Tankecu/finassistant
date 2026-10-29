import { db, type Category, type ExchangeRate, type SettingsRec } from './db';
import { uid } from '@/lib/utils';

interface CategorySeed {
  name: string;
  kind: 'income' | 'expense';
  emoji: string;
  color: string;
  keywords: string[];
}

export const CATEGORY_SEEDS: CategorySeed[] = [
  // ── Расходы ──
  {
    name: 'Еда', kind: 'expense', emoji: '🍔', color: '#f59e0b',
    keywords: ['еда', 'еду', 'поел', 'поесть', 'кофе', 'чай', 'обед', 'ужин', 'завтрак', 'продукты', 'продуктов', 'санса', 'сансы', 'шаверма', 'шаверму', 'пицца', 'бургер', 'ланч', 'перекус', 'ресторан', 'кафе', 'фастфуд', 'доставка', 'суши', 'лапша', 'плов', 'food', 'lunch', 'coffee'],
  },
  {
    name: 'Транспорт', kind: 'expense', emoji: '🚕', color: '#60a5fa',
    keywords: ['такси', 'бензин', 'заправка', 'автобус', 'метро', 'маршрутка', 'транспорт', 'проезд', 'поезд', 'электричка', 'парковка', 'мойка', 'uber', 'yandex', 'taxi', 'gas'],
  },
  {
    name: 'Жильё', kind: 'expense', emoji: '🏠', color: '#a78bfa',
    keywords: ['аренда', 'аренду', 'квартира', 'квартиру', 'коммуналка', 'коммунальные', 'свет', 'газ', 'электричество', 'ремонт', 'ипотека', 'квартплата', 'rent', 'home'],
  },
  {
    name: 'Здоровье', kind: 'expense', emoji: '💊', color: '#f87171',
    keywords: ['аптека', 'аптеке', 'лекарства', 'лекарство', 'таблетки', 'врач', 'доктор', 'больница', 'стоматолог', 'анализы', 'витамины', 'здоровье', 'медицина', 'pharmacy', 'doctor', 'medicine'],
  },
  {
    name: 'Образование', kind: 'expense', emoji: '📚', color: '#38bdf8',
    keywords: ['курс', 'курсы', 'книга', 'книги', 'учебник', 'обучение', 'университет', 'репетитор', 'школа', 'образование', 'учеба', 'education', 'book', 'course'],
  },
  {
    name: 'Развлечения', kind: 'expense', emoji: '🎮', color: '#f472b6',
    keywords: ['кино', 'фильм', 'игра', 'игры', 'игрушки', 'отдых', 'бар', 'клуб', 'концерт', 'стим', 'steam', 'твитч', 'развлечение', 'развлечения', 'game', 'movie', 'cinema'],
  },
  {
    name: 'Техника', kind: 'expense', emoji: '💻', color: '#34d399',
    keywords: ['ноутбук', 'телефон', 'наушники', 'наушники', 'компьютер', 'зарядка', 'кабель', 'чехол', 'экран', 'мышка', 'клавиатура', 'ssd', 'флешка', 'смартфон', 'айфон', 'iphone', 'macbook', 'техника', 'gadget', 'laptop', 'headphones'],
  },
  {
    name: 'Одежда', kind: 'expense', emoji: '👕', color: '#fb923c',
    keywords: ['одежда', 'футболка', 'джинсы', 'кроссовки', 'куртка', 'обувь', 'рубашка', 'штаны', 'носки', 'свитер', 'кепка', 'шапка', 'clothes', 'shoes'],
  },
  {
    name: 'Подписки', kind: 'expense', emoji: '🔄', color: '#c084fc',
    keywords: ['подписка', 'подписки', 'подписался', 'netflix', 'spotify', 'icloud', 'apple music', 'ютуб премиум', 'kinopoisk', 'иви', 'subscription'],
  },
  {
    name: 'Связь', kind: 'expense', emoji: '📱', color: '#2dd4bf',
    keywords: ['интернет', 'мобильный', 'связь', 'пополнение', 'баланс', 'тариф', 'симка', 'roaming', 'mobile', 'internet'],
  },
  {
    name: 'Бизнес', kind: 'expense', emoji: '💼', color: '#94a3b8',
    keywords: ['бизнес', 'реклама', 'хостинг', 'домен', 'сервер', 'налог', 'налоги', 'патент', 'office', 'business', 'ads'],
  },
  {
    name: 'Другое', kind: 'expense', emoji: '📦', color: '#64748b',
    keywords: [],
  },
  // ── Доходы ──
  {
    name: 'Зарплата', kind: 'income', emoji: '💰', color: '#34d399',
    keywords: ['зарплата', 'зарплату', 'аванс', 'оклад', 'премия', 'salary', 'payroll'],
  },
  {
    name: 'Фриланс', kind: 'income', emoji: '🧑‍💻', color: '#60a5fa',
    keywords: ['фриланс', 'заказ', 'заказу', 'проект', 'клиент', 'гонорар', 'freelance', 'project'],
  },
  {
    name: 'Бизнес', kind: 'income', emoji: '🏪', color: '#a78bfa',
    keywords: ['выручка', 'прибыль', 'продажи', 'business', 'revenue'],
  },
  {
    name: 'Подарок', kind: 'income', emoji: '🎁', color: '#f472b6',
    keywords: ['подарок', 'подарили', 'презент', 'gift', 'present'],
  },
  {
    name: 'Возврат', kind: 'income', emoji: '↩️', color: '#2dd4bf',
    keywords: ['возврат', 'вернули', 'кэшбэк', 'кешбэк', 'кешбек', 'refund', 'cashback'],
  },
  {
    name: 'Другое', kind: 'income', emoji: '✨', color: '#64748b',
    keywords: ['доход', 'подработка', 'процент', 'проценты', 'дивиденды', 'dividend', 'interest', 'bonus'],
  },
];

/** Стартовые курсы — примерные, пользователь редактирует их в настройках. */
const RATE_SEEDS: Array<[string, number]> = [
  ['USD', 12650],
  ['EUR', 13700],
  ['RUB', 138],
  ['GBP', 16100],
  ['KZT', 24],
  ['TRY', 380],
];

export async function seedDatabase(): Promise<void> {
  const now = new Date().toISOString();
  const baseCurrency = 'UZS';

  await db.settings.put({
    id: 'app',
    baseCurrency,
    onboarded: 0,
    autoCreateRecurring: 0,
    autoRates: 1,
    voiceLocale: 'ru-RU',
    createdAt: now,
  } satisfies SettingsRec);

  const categories: Category[] = CATEGORY_SEEDS.map((seed, i) => ({
    id: uid('cat'),
    name: seed.name,
    kind: seed.kind,
    emoji: seed.emoji,
    color: seed.color,
    keywords: seed.keywords,
    sortOrder: i,
    isSystem: 1,
  }));
  await db.categories.bulkAdd(categories);

  const rates: ExchangeRate[] = [
    { code: baseCurrency, rate: 1, manual: 1, updatedAt: now },
    ...RATE_SEEDS.map(([code, rate]): ExchangeRate => ({ code, rate, manual: 1, updatedAt: now })),
  ];
  await db.exchangeRates.bulkPut(rates);
}

/** Категория-заглушка, когда в базе нет ни одной (не должен случаться после populate, но безопасно). */
export function fallbackCategory(kind: 'income' | 'expense'): Omit<Category, 'id'> {
  return {
    name: 'Другое',
    kind,
    emoji: kind === 'expense' ? '📦' : '✨',
    color: '#64748b',
    keywords: [],
    sortOrder: 999,
    isSystem: 1,
  };
}
