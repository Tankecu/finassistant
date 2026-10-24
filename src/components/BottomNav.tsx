import type { ReactNode } from 'react';
import { useUI, type Tab } from '@/store/ui';
import { cn } from '@/lib/utils';

const TABS: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  {
    id: 'home', label: 'Главная',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </svg>
    ),
  },
  {
    id: 'transactions', label: 'Операции',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 7h16M4 12h16M4 17h10" />
      </svg>
    ),
  },
  {
    id: 'analytics', label: 'Аналитика',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    id: 'more', label: 'Ещё',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const { tab, setTab, openQuickAdd } = useUI();
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur border-t border-border safe-bottom">
      <div className="grid grid-cols-5 items-end max-w-md mx-auto px-2">
        {left.map((t) => <TabButton key={t.id} t={t} active={tab === t.id} onClick={() => setTab(t.id)} />)}
        <div className="flex justify-center">
          <button
            onClick={() => openQuickAdd()}
            aria-label="Добавить операцию"
            className="-mt-5 w-14 h-14 rounded-full bg-accent text-bg shadow-lg shadow-accent/25 flex items-center justify-center active:scale-95 transition-transform"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        {right.map((t) => <TabButton key={t.id} t={t} active={tab === t.id} onClick={() => setTab(t.id)} />)}
      </div>
    </nav>
  );
}

function TabButton({ t, active, onClick }: { t: (typeof TABS)[number]; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors',
        active ? 'text-accent' : 'text-faint',
      )}
    >
      {t.icon}
      {t.label}
    </button>
  );
}
