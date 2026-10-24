import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { dueRecurring } from '@/services/selectors';
import { TopBar, Card } from '@/components/ui';
import { GoalsScreen } from '@/features/goals/GoalsScreen';
import { AccountsScreen } from '@/features/accounts/AccountsScreen';
import { PurchasesScreen } from '@/features/purchases/PurchasesScreen';
import { WishlistScreen } from '@/features/wishlist/WishlistScreen';
import { BudgetsScreen } from '@/features/budgets/BudgetsScreen';
import { RecurringScreen } from '@/features/recurring/RecurringScreen';
import { NotesScreen } from '@/features/notes/NotesScreen';
import { CategoriesScreen } from '@/features/categories/CategoriesScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { todayISO } from '@/lib/dates';

type Sub =
  | null
  | 'goals' | 'accounts' | 'purchases' | 'wishlist' | 'budgets'
  | 'recurring' | 'notes' | 'categories' | 'settings';

const ITEMS: Array<{ id: Exclude<Sub, null>; label: string; emoji: string; hint: string }> = [
  { id: 'goals', label: 'Цели и накопления', emoji: '🎯', hint: 'Америка, ноутбук, подушка' },
  { id: 'accounts', label: 'Счета и активы', emoji: '👛', hint: 'Деньги, имущество, долги' },
  { id: 'purchases', label: 'Покупки', emoji: '🛍️', hint: 'Что купил и стоило ли' },
  { id: 'wishlist', label: 'Запланировано', emoji: '⭐', hint: 'Хочу / планирую / коплю' },
  { id: 'budgets', label: 'Бюджеты', emoji: '🎚', hint: 'Месячные лимиты по категориям' },
  { id: 'recurring', label: 'Регулярные платежи', emoji: '🔁', hint: 'Аренда, подписки, зарплата' },
  { id: 'notes', label: 'Заметки', emoji: '📝', hint: 'Мысли о деньгах' },
  { id: 'categories', label: 'Категории', emoji: '🗂', hint: 'Словари для быстрого ввода' },
  { id: 'settings', label: 'Настройки', emoji: '⚙️', hint: 'Валюты, курсы, экспорт' },
];

export function MoreScreen() {
  const [sub, setSub] = useState<Sub>(null);

  const recurring = useLiveQuery(() => db.recurring.toArray(), []) ?? [];
  const dueCount = dueRecurring(recurring, todayISO()).length;
  const goals = useLiveQuery(() => db.goals.where('status').equals('active').toArray(), []) ?? [];

  if (sub) {
    switch (sub) {
      case 'goals': return <GoalsScreen onBack={() => setSub(null)} />;
      case 'accounts': return <AccountsScreen onBack={() => setSub(null)} />;
      case 'purchases': return <PurchasesScreen onBack={() => setSub(null)} />;
      case 'wishlist': return <WishlistScreen onBack={() => setSub(null)} />;
      case 'budgets': return <BudgetsScreen onBack={() => setSub(null)} />;
      case 'recurring': return <RecurringScreen onBack={() => setSub(null)} />;
      case 'notes': return <NotesScreen onBack={() => setSub(null)} />;
      case 'categories': return <CategoriesScreen onBack={() => setSub(null)} />;
      case 'settings': return <SettingsScreen onBack={() => setSub(null)} />;
    }
  }

  return (
    <div className="pb-24">
      <TopBar title="Ещё" />
      <div className="px-4 grid grid-cols-2 gap-2.5">
        {ITEMS.map((item) => (
          <Card key={item.id} className="!p-3.5 flex flex-col gap-1 min-h-24" onClick={() => setSub(item.id)}>
            <div className="flex items-center justify-between">
              <span className="text-2xl">{item.emoji}</span>
              {item.id === 'recurring' && dueCount > 0 && (
                <span className="text-[11px] bg-warning/15 text-warning rounded-full px-2 py-0.5 font-medium">{dueCount} ждёт</span>
              )}
              {item.id === 'goals' && goals.length > 0 && (
                <span className="text-[11px] text-faint">{goals.length}</span>
              )}
            </div>
            <div className="font-medium text-[14px] leading-tight">{item.label}</div>
            <div className="text-[11px] text-faint leading-tight">{item.hint}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
