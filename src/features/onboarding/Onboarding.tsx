import { useState } from 'react';
import { ACCOUNT_KIND_LABELS, type AccountKind } from '@/db/db';
import { createAccount, suggestAccountColor } from '@/services/accounts';
import { createGoal } from '@/services/entities';
import { updateSettings } from '@/services/settings';
import { parseAmountInput, formatMoney, COMMON_CURRENCY_CODES, currencyMeta } from '@/lib/money';
import { Button, Field, Input, Select } from '@/components/ui';
import { cn } from '@/lib/utils';

const KIND_OPTIONS: AccountKind[] = ['cash', 'card', 'bank', 'ewallet', 'savings', 'investment', 'crypto', 'asset', 'liability'];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [baseCurrency, setBaseCurrency] = useState('UZS');
  const [accName, setAccName] = useState('');
  const [accKind, setAccKind] = useState<AccountKind>('cash');
  const [accCurrency, setAccCurrency] = useState('UZS');
  const [accBalance, setAccBalance] = useState('');
  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = async (addAnother?: boolean) => {
    setBusy(true);
    try {
      const minor = parseAmountInput(accBalance || '0', accCurrency) ?? 0;
      await createAccount({
        name: accName.trim() || ACCOUNT_KIND_LABELS[accKind],
        kind: accKind,
        currency: accCurrency,
        openingBalance: minor,
        color: suggestAccountColor(accKind),
      });
      if (addAnother) {
        setAccName('');
        setAccBalance('');
        setStep(1);
        return;
      }
      if (goalName.trim() && goalAmount) {
        const target = parseAmountInput(goalAmount, baseCurrency);
        if (target) {
          await createGoal({
            name: goalName.trim(),
            targetAmount: target,
            currency: baseCurrency,
            deadline: goalDeadline || undefined,
          });
        }
      }
      await updateSettings({ baseCurrency, onboarded: 1 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col px-5 pt-10 pb-6 max-w-md w-full mx-auto">
      <div className="mb-8">
        <div className="text-3xl mb-2">🌱</div>
        <h1 className="text-2xl font-bold">{step === 0 ? 'Добро пожаловать' : step === 1 ? 'Первый счёт' : 'Первая цель'}</h1>
        <p className="text-muted text-sm mt-1">
          {step === 0
            ? 'Настройка займёт меньше минуты.'
            : step === 1
              ? 'Где лежат ваши деньги? Баланс можно изменить позже.'
              : 'К чему хотите прийти? Можно пропустить.'}
        </p>
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-3">
          <Field label="Основная валюта">
            <Select value={baseCurrency} onChange={(e) => { setBaseCurrency(e.target.value); setAccCurrency(e.target.value); }}>
              {COMMON_CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>{c} — {currencyMeta(c).name}</option>
              ))}
            </Select>
          </Field>
          <p className="text-faint text-[13px] px-1">
            Все суммы будут приводиться к {baseCurrency}. Курсы можно поменять в настройках.
          </p>
          <div className="mt-auto">
            <Button variant="primary" size="lg" onClick={() => setStep(1)}>Дальше</Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <Field label="Тип счёта">
            <div className="grid grid-cols-3 gap-2">
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k}
                  onClick={() => { setAccKind(k); if (!accName || KIND_OPTIONS.includes(accName as AccountKind)) setAccName(ACCOUNT_KIND_LABELS[k]); }}
                  className={cn(
                    'rounded-xl border px-2 py-2.5 text-[13px] transition-colors',
                    accKind === k ? 'border-accent/70 bg-accent-dim text-accent' : 'border-border bg-surface-2 text-muted',
                  )}
                >
                  {ACCOUNT_KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Название">
            <Input value={accName} onChange={(e) => setAccName(e.target.value)} placeholder={ACCOUNT_KIND_LABELS[accKind]} />
          </Field>
          <div className="flex gap-2">
            <Field label="Валюта">
              <Select value={accCurrency} onChange={(e) => setAccCurrency(e.target.value)} className="w-28">
                {COMMON_CURRENCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <div className="flex-1">
              <Field label="Текущий баланс">
                <Input
                  inputMode="decimal"
                  value={accBalance}
                  onChange={(e) => setAccBalance(e.target.value)}
                  placeholder="0"
                  className="num text-lg"
                />
              </Field>
            </div>
          </div>
          {accBalance && parseAmountInput(accBalance, accCurrency) !== null && (
            <p className="text-faint text-[13px] px-1 num">{formatMoney(parseAmountInput(accBalance, accCurrency)!, accCurrency)}</p>
          )}
          <div className="mt-auto flex flex-col gap-2">
            <Button variant="primary" size="lg" disabled={busy} onClick={() => void finish(false)}>
              {busy ? 'Сохраняю…' : 'Сохранить счёт'}
            </Button>
            <Button size="lg" disabled={busy} onClick={() => void finish(true)}>
              Добавить ещё счёт
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <Field label="Название цели">
            <Input value={goalName} onChange={(e) => setGoalName(e.target.value)} placeholder="Америка, ноутбук, подушка…" />
          </Field>
          <div className="flex gap-2">
            <div className="flex-1">
              <Field label={`Сколько нужно (${baseCurrency})`}>
                <Input inputMode="decimal" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} placeholder="10000" className="num" />
              </Field>
            </div>
            <Field label="Дата">
              <Input type="date" value={goalDeadline} onChange={(e) => setGoalDeadline(e.target.value)} className="w-40" />
            </Field>
          </div>
          <p className="text-faint text-[13px] px-1">
            Прогресс считается по операциям «Накопление», привязанным к цели.
          </p>
          <div className="mt-auto flex flex-col gap-2">
            <Button variant="primary" size="lg" disabled={busy} onClick={() => void finish(false)}>
              Начать пользоваться
            </Button>
            <Button size="lg" disabled={busy} onClick={() => void finish(false)}>
              Пропустить
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-1.5 justify-center mt-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn('h-1.5 rounded-full transition-all', step === i ? 'w-6 bg-accent' : 'w-1.5 bg-border')} />
        ))}
      </div>
    </div>
  );
}
