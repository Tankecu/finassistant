import { create } from 'zustand';
import type { TxType } from '@/db/db';

export type Tab = 'home' | 'transactions' | 'analytics' | 'more';

export interface QuickAddPreset {
  type?: TxType;
  goalId?: string;
  purchase?: boolean;
}

interface UIState {
  tab: Tab;
  setTab: (t: Tab) => void;
  quickAddOpen: boolean;
  quickAddPreset: QuickAddPreset | null;
  openQuickAdd: (preset?: QuickAddPreset) => void;
  closeQuickAdd: () => void;
  detailTxId: string | null;
  openTxDetail: (id: string) => void;
  closeTxDetail: () => void;
  toast: string | null;
  showToast: (msg: string) => void;
}

export const useUI = create<UIState>((set) => ({
  tab: 'home',
  setTab: (t) => set({ tab: t }),
  quickAddOpen: false,
  quickAddPreset: null,
  openQuickAdd: (preset) => set({ quickAddOpen: true, quickAddPreset: preset ?? null }),
  closeQuickAdd: () => set({ quickAddOpen: false, quickAddPreset: null }),
  detailTxId: null,
  openTxDetail: (id) => set({ detailTxId: id }),
  closeTxDetail: () => set({ detailTxId: null }),
  toast: null,
  showToast: (msg) => {
    set({ toast: msg });
    setTimeout(() => set((s) => (s.toast === msg ? { toast: null } : s)), 2200);
  },
}));
