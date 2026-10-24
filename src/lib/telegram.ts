/**
 * Интеграция с Telegram Mini App. Вне Telegram всё молча выключено —
 * приложение работает как обычный PWA.
 * Документация: https://core.telegram.org/bots/webapps
 */

interface TelegramWebApp {
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  disableVerticalSwipes?(): void;
  HapticFeedback?: {
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  };
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  themeParams?: Record<string, string>;
  initDataUnsafe?: { user?: { id: number; first_name?: string } };
}

export function getTelegram(): TelegramWebApp | null {
  const w = window as unknown as { Telegram?: { WebApp?: TelegramWebApp } };
  return w.Telegram?.WebApp ?? null;
}

export function isTelegram(): boolean {
  return getTelegram() !== null;
}

/** Вызвать один раз при старте. */
export function initTelegram(): void {
  const tg = getTelegram();
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.('#0b0f14');
    tg.setBackgroundColor?.('#0b0f14');
    tg.disableVerticalSwipes?.();
  } catch {
    /* старые клиенты — не критично */
  }
}

/** Лёгкая вибрация при успешном сохранении. */
export function hapticSuccess(): void {
  try {
    getTelegram()?.HapticFeedback?.notificationOccurred('success');
  } catch {
    /* вне Telegram */
  }
}

export function hapticLight(): void {
  try {
    getTelegram()?.HapticFeedback?.impactOccurred('light');
  } catch {
    /* вне Telegram */
  }
}

/** Кнопка «Назад» Telegram как закрытие bottom sheet. */
export function bindBackButton(onBack: () => void): () => void {
  const tg = getTelegram();
  const bb = tg?.BackButton;
  if (!bb) return () => undefined;
  const handler = () => onBack();
  try {
    bb.onClick(handler);
    bb.show();
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      bb.offClick(handler);
      bb.hide();
    } catch {
      /* уже скрыта */
    }
  };
}
