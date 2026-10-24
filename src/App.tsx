import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { TransactionsScreen } from '@/features/transactions/TransactionsScreen';
import { AnalyticsScreen } from '@/features/analytics/AnalyticsScreen';
import { MoreScreen } from '@/features/more/MoreScreen';
import { BottomNav } from '@/components/BottomNav';
import { QuickAddSheet } from '@/features/quickadd/QuickAddSheet';
import { TxDetailSheet } from '@/features/transactions/TxDetailSheet';
import { useUI } from '@/store/ui';
import { dueRecurring } from '@/services/selectors';
import { runRecurringNow } from '@/services/entities';
import { todayISO } from '@/lib/dates';

export function App() {
  const tab = useUI((s) => s.tab);
  const toast = useUI((s) => s.toast);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void db.open().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-faint text-sm">Открываю финансы…</div>
      </div>
    );
  }

  return <AppBody tab={tab} toast={toast} />;
}

function AppBody({ tab, toast }: { tab: string; toast: string | null }) {
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const recurring = useLiveQuery(() => db.recurring.where('active').equals(1).toArray(), []) ?? [];
  const autoRan = useRef(false);
  const { showToast } = useUI();

  // автопроведение регулярных платежей (если включено в настройках)
  useEffect(() => {
    if (autoRan.current || !settings?.autoCreateRecurring || recurring.length === 0) return;
    const due = dueRecurring(recurring, todayISO());
    if (due.length === 0) return;
    autoRan.current = true;
    void (async () => {
      for (const r of due) await runRecurringNow(r);
      showToast(`Автоматически проведено: ${due.length}`);
    })();
  }, [settings?.autoCreateRecurring, recurring, showToast]);

  if (!settings) return null;

  if (!settings.onboarded) {
    return <Onboarding />;
  }

  return (
    <div className="flex-1 flex flex-col max-w-md w-full mx-auto">
      <main className="flex-1">
        {tab === 'home' && <Dashboard />}
        {tab === 'transactions' && <TransactionsScreen />}
        {tab === 'analytics' && <AnalyticsScreen />}
        {tab === 'more' && <MoreScreen />}
      </main>
      <BottomNav />
      <QuickAddSheet />
      <TxDetailSheet />
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-surface-2 border border-border text-text text-sm px-4 py-2.5 rounded-full shadow-xl animate-fade">
          {toast}
        </div>
      )}
    </div>
  );
}
