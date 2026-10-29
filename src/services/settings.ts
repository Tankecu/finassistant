import { db, type SettingsRec } from '@/db/db';
import { CURRENCIES } from '@/lib/money';
import { fetchLiveRates } from './exchange';

export async function getSettings(): Promise<SettingsRec | undefined> {
  return db.settings.get('app');
}

export async function updateSettings(patch: Partial<Omit<SettingsRec, 'id' | 'createdAt'>>): Promise<void> {
  await db.settings.update('app', patch);
}

/**
 * Смена базовой валюты: пересчёт всех курсов.
 * Старые курсы: 1 unit валюты = r_old(c) единиц старой базы.
 * Новые: 1 unit валюты = r_old(c) / r_old(newBase) единиц новой базы.
 * НИ ОДНА строка курса не удаляется — валюты, по которым нет курса,
 * получают его из живого API сразу после смены базы.
 */
export async function changeBaseCurrency(newBase: string): Promise<void> {
  const settings = await db.settings.get('app');
  if (!settings) return;
  const oldBase = settings.baseCurrency;
  if (oldBase === newBase) return;

  const oldRates = await db.exchangeRates.toArray();
  const map = new Map(oldRates.map((r) => [r.code, r]));
  const oldBaseRate = map.get(newBase)?.rate;

  const now = new Date().toISOString();
  await db.transaction('rw', db.exchangeRates, async () => {
    if (oldBaseRate && oldBaseRate > 0) {
      // пересчитываем ВСЕ валюты, включая бывшую базовую
      for (const code of Object.keys(CURRENCIES)) {
        const r = map.get(code);
        const rate = code === newBase ? 1 : r ? r.rate / oldBaseRate : undefined;
        if (rate !== undefined && Number.isFinite(rate) && rate > 0) {
          await db.exchangeRates.put({ code, rate, manual: 1, updatedAt: now });
        }
      }
    }
    // строка базовой валюты обязана существовать с курсом 1
    await db.exchangeRates.put({ code: newBase, rate: 1, manual: 1, updatedAt: now });
  });

  await db.settings.update('app', { baseCurrency: newBase });

  // подтягиваем живые курсы под новую базу (не блокируя UI)
  void fetchLiveRates(newBase).catch(() => undefined);
}
