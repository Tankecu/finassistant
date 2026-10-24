import { db, type SettingsRec } from '@/db/db';
import { CURRENCIES } from '@/lib/money';

export async function getSettings(): Promise<SettingsRec | undefined> {
  return db.settings.get('app');
}

export async function updateSettings(patch: Partial<Omit<SettingsRec, 'id' | 'createdAt'>>): Promise<void> {
  await db.settings.update('app', patch);
}

/**
 * Смена базовой валюты: пересчёт курсов.
 * Старые курсы: 1 unit валюты = r_old(c) единиц старой базы.
 * Новые: 1 unit валюты = r_old(c) / r_old(newBase) единиц новой базы.
 * Валюты без курса сохраняют курс 1 относительно самих себя, остальные — придётся ввести вручную.
 */
export async function changeBaseCurrency(newBase: string): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings) return;
  const oldBase = settings.baseCurrency;
  if (oldBase === newBase) return;

  const oldRates = await db.exchangeRates.toArray();
  const map = new Map(oldRates.map((r) => [r.code, r.rate]));
  const oldBaseRate = map.get(newBase);

  const now = new Date().toISOString();
  if (oldBaseRate && oldBaseRate > 0) {
    for (const code of Object.keys(CURRENCIES)) {
      const r = map.get(code);
      if (r !== undefined) {
        await db.exchangeRates.put({ code, rate: r / oldBaseRate, manual: 1, updatedAt: now });
      }
    }
  }
  await db.exchangeRates.put({ code: newBase, rate: 1, manual: 1, updatedAt: now });
  await db.exchangeRates.delete(oldBase);
  await db.settings.update('app', { baseCurrency: newBase });
}
