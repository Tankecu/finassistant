import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { bindBackButton } from '@/lib/telegram';

// ── Button ──

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent-soft';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors active:opacity-80 disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2.5 text-[15px]',
        size === 'lg' && 'px-5 py-3.5 text-base w-full',
        variant === 'primary' && 'bg-accent text-bg font-semibold',
        variant === 'secondary' && 'bg-surface-2 text-text border border-border',
        variant === 'ghost' && 'text-muted hover:text-text',
        variant === 'danger' && 'bg-danger-dim text-danger',
        variant === 'accent-soft' && 'bg-accent-dim text-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── Card ──

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-surface rounded-2xl border border-border p-4',
        onClick && 'active:opacity-80 cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 mb-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">{children}</h2>
      {action}
    </div>
  );
}

// ── Inputs ──

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full bg-surface-2 border border-border rounded-xl px-3.5 py-3 text-text placeholder:text-faint outline-none focus:border-accent/60 transition-colors',
        className,
      )}
      {...rest}
    />
  );
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full bg-surface-2 border border-border rounded-xl px-3.5 py-3 text-text placeholder:text-faint outline-none focus:border-accent/60 transition-colors resize-y min-h-24',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full bg-surface-2 border border-border rounded-xl px-3.5 py-3 text-text outline-none focus:border-accent/60 appearance-none',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] text-muted mb-1.5 px-1">{label}</span>
      {children}
    </label>
  );
}

// ── Chip ──

export function Chip({
  active,
  color,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; color?: string }) {
  return (
    <button
      className={cn(
        'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors active:opacity-80',
        active
          ? 'border-accent/70 bg-accent-dim text-accent font-medium'
          : 'border-border bg-surface-2 text-muted',
        className,
      )}
      style={active && color ? { borderColor: color, color, backgroundColor: `${color}1f` } : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

// ── SegmentedControl ──

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: string; color?: string }>;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex bg-surface-2 rounded-xl border border-border p-1 gap-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
            value === o.value ? 'bg-surface shadow-sm' : 'text-muted',
          )}
          style={value === o.value && o.color ? { color: o.color } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── ProgressBar ──

export function ProgressBar({ value, color = 'var(--color-accent)', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn('h-2 rounded-full bg-surface-2 overflow-hidden', className)}>
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Sheet (bottom) ──

export function Sheet({
  open,
  onClose,
  title,
  children,
  full,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  full?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // в Telegram кнопку «Назад» используем для закрытия шита
    const unbind = bindBackButton(onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      unbind();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 animate-fade" onClick={onClose} />
      <div
        className={cn(
          'relative bg-surface border-t border-border rounded-t-3xl animate-sheet max-h-[92dvh] flex flex-col',
          full && 'h-[92dvh]',
        )}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border absolute left-1/2 -translate-x-1/2 top-2" />
          {title && <h3 className="text-base font-semibold mt-2">{title}</h3>}
          <button onClick={onClose} className="ml-auto mt-2 w-8 h-8 rounded-full bg-surface-2 text-muted flex items-center justify-center text-lg leading-none" aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-4 safe-bottom flex-1">{children}</div>
      </div>
    </div>
  );
}

// ── EmptyState ──

export function EmptyState({ emoji, title, hint }: { emoji: string; title: string; hint?: string }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-4xl mb-3">{emoji}</div>
      <p className="text-muted font-medium">{title}</p>
      {hint && <p className="text-faint text-sm mt-1">{hint}</p>}
    </div>
  );
}

// ── TopBar ──

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-2 pb-3 sticky top-0 bg-bg/95 backdrop-blur z-20 safe-top">
      {onBack && (
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-muted" aria-label="Назад">
          ←
        </button>
      )}
      <h1 className="text-xl font-bold flex-1 truncate">{title}</h1>
      {right}
    </div>
  );
}

// ── Row (list item) ──

export function Row({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 py-3',
        onClick && 'active:opacity-70 cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── Confirm ──

export function Confirm({
  open,
  title,
  text,
  confirmLabel = 'Удалить',
  danger = true,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  text?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="pt-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {text && <p className="text-muted text-sm mt-2">{text}</p>}
        <div className="flex gap-2 mt-5 mb-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Отмена
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="text-warning text-sm" title={`${value}/10`}>
      {'★'.repeat(Math.round(value / 2))}
      <span className="text-faint">{'★'.repeat(5 - Math.round(value / 2))}</span>
      <span className="text-faint ml-1">{value}/10</span>
    </span>
  );
}
