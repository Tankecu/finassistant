import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { CalcSnapshot } from './selectors';

/** Реактивный снимок всех данных для расчётов. undefined — пока IndexedDB не отдала данные. */
export function useSnapshot(): CalcSnapshot | undefined {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const valuations = useLiveQuery(() => db.valuations.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const rates = useLiveQuery(() => db.exchangeRates.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get('app'), []);

  if (!accounts || !transactions || !valuations || !categories || !goals || !rates || !settings) {
    return undefined;
  }
  return {
    accounts,
    transactions,
    valuations,
    categories,
    goals,
    rates,
    baseCurrency: settings.baseCurrency,
  };
}
