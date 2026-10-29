import { db } from '@/db/db';
import { CURRENCIES } from '@/lib/money';
import type { SettingsRec } from '@/db/db';

export interface LiveRatesResult {
  source: 'currency-api' | 'er-api';
  fetchedAt: string;
  /** Сколько валют обновлено */
  updated: number;
  skipped: number; // ручные курсы не трогаем
}

/**
 * Живые курсы из бесплатных API без ключей.
 * Курс в БД хранится как «1 единица валюты = rate единиц базовой».
 * Все провайдеры отдают таблицу «валют на 1 USD» → пересчитываем к базовой.
 */
export async function fetchLiveRates(base: string): Promise<LiveRatesResult | null> {
  const perUsd = await fetchPerUsdTable();
  if (!perUsd) return null;

  const baseKey = base.toLowerCase();
  const basePerUsd = perUsd[baseKey];
  if (!basePerUsd || basePerUsd <= 0) return null;

  const now = new Date().toISOString();
  const settings = await db.settings.get('app');
  // самое первое обновление: стартовые seed-курсы переводим в авто
  const firstEver = !settings?.ratesUpdatedAt;
  const existing = await db.exchangeRates.toArray();
  const manualCodes = new Set(
    firstEver ? [] : existing.filter((r) => r.manual === 1).map((r) => r.code),
  );

  let updated = 0;
  let skipped = 0;
  await db.transaction('rw', db.exchangeRates, async () => {
    for (const code of Object.keys(CURRENCIES)) {
      const perUsdRate = perUsd[code.toLowerCase()];
      if (!perUsdRate || perUsdRate <= 0) continue;
      const rateToBase = basePerUsd / perUsdRate;
      if (code === base) {
        await db.exchangeRates.put({ code, rate: 1, manual: 1, updatedAt: now });
        continue;
      }
      if (manualCodes.has(code)) {
        skipped++;
        continue;
      }
      await db.exchangeRates.put({ code, rate: rateToBase, manual: 0, updatedAt: now });
      updated++;
    }
  });

  await updateRatesMeta(now, 'live');
  return { source: 'currency-api', fetchedAt: now, updated, skipped };
}

/** Таблица «валют на 1 USD» с зеркалами на случай недоступности. */
async function fetchPerUsdTable(): Promise<Record<string, number> | null> {
  // 1. currency-api на jsDelivr (CDN, CORS, без ключей, обновляется ежедневно)
  const sources: Array<() => Promise<Record<string, number> | null>> = [
    async () => {
      const r = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
      if (!r.ok) return null;
      const data = await r.json();
      const table = data?.usd;
      return table && typeof table === 'object' ? (table as Record<string, number>) : null;
    },
    async () => {
      // зеркало проекта currency-api
      const r = await fetch('https://latest.currency-api.pages.dev/v1/currencies/usd.json');
      if (!r.ok) return null;
      const data = await r.json();
      const table = data?.usd;
      return table && typeof table === 'object' ? (table as Record<string, number>) : null;
    },
    async () => {
      // 2. open.er-api.com (без ключей, CORS)
      const r = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!r.ok) return null;
      const data = await r.json();
      const table = data?.rates;
      return table && typeof table === 'object'
        ? Object.fromEntries(Object.entries(table).map(([k, v]) => [k.toLowerCase(), v as number]))
        : null;
    },
  ];

  for (const get of sources) {
    try {
      const table = await get();
      if (table && 'uzs' in table) return table;
    } catch {
      /* следующий источник */
    }
  }
  return null;
}

async function updateRatesMeta(updatedAt: string, source: string): Promise<void> {
  await db.settings.update('app', { ratesUpdatedAt: updatedAt, ratesSource: source } as Partial<SettingsRec>);
}

/**
 * Автообновление при открытии приложения: не чаще раза в 12 часов.
 * Тихо: без тостов — сеть могла пропасть, есть последние сохранённые курсы.
 */
export async function maybeAutoRefreshRates(): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings || settings.autoRates === 0) return;
  const last = settings.ratesUpdatedAt ? new Date(settings.ratesUpdatedAt).getTime() : 0;
  const ageH = (Date.now() - last) / 3_600_000;
  if (last > 0 && ageH < 12) return;
  try {
    await fetchLiveRates(settings.baseCurrency);
  } catch {
    /* офлайн — работаем на сохранённых курсах */
  }
}
