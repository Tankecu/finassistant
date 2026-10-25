import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TxType } from '@/db/db';
import { saveTransaction, type TxInput } from '@/services/transactions';
import { COMMON_CURRENCY_CODES, convertMinor, formatMoney, parseAmountInput, ratesMap, toMajor } from '@/lib/money';
import { todayISO } from '@/lib/dates';
import { Button, Field, Input, Segmented, Select, TextArea } from '@/components/ui';
import { defaultAccountId } from '@/services/selectors';

export interface TransactionFormInitial {
  id?: string;
  type?: TxType;
  amountMajor?: number | null;
  currency?: string;
  accountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  date?: string;
  description?: string;
  notes?: string;
  goalId?: string | null;
}

export function TransactionForm({
  initial,
  defaultType = 'expense',
  onSaved,
  onCancel,
}: {
  initial?: TransactionFormInitial;
  defaultType?: TxType;
  onSaved: (id: string) => void;
  onCancel?: () => void;
}) {
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.archived).sortBy('sortOrder'), []) ?? [];
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []) ?? [];
  const goals = useLiveQuery(() => db.goals.where('status').equals('active').toArray(), []) ?? [];
  const ratesList = useLiveQuery(() => db.exchangeRates.toArray(), []) ?? [];
  const settings = useLiveQuery(() => db.settings.get('app'), []);

  const [type, setType] = useState<TxType>(initial?.type ?? defaultType);
  const [amount, setAmount] = useState(initial?.amountMajor != null ? String(initial.amountMajor) : '');
  const [currency, setCurrency] = useState(initial?.currency ?? settings?.baseCurrency ?? 'UZS');
  const [accountId, setAccountId] = useState<string | null>(
    initial?.accountId ?? defaultAccountId(accounts, settings?.lastAccountId) ?? null,
  );
  const [toAccountId, setToAccountId] = useState<string | null>(initial?.toAccountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [description, setDescription] = useState(initial?.description ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [goalId, setGoalId] = useState<string | null>(initial?.goalId ?? null);
  const [receivedTouched, setReceivedTouched] = useState(false);
  const [receivedStr, setReceivedStr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currencyTouched = useRef(false);

  // данные приходят асинхронно — подставляем дефолты, если пользователь ещё не выбрал
  useEffect(() => {
    if (!initial?.accountId && accountId === null && accounts.length > 0) {
      setAccountId(defaultAccountId(accounts, settings?.lastAccountId) ?? null);
    }
  }, [accounts, settings?.lastAccountId, accountId, initial?.accountId]);

  useEffect(() => {
    if (!initial?.currency && settings?.baseCurrency) {
      setCurrency((c) => (currencyTouched.current ? c : settings.baseCurrency));
    }
  }, [settings?.baseCurrency, initial?.currency]);

  const amountMinor = useMemo(() => (amount ? parseAmountInput(amount, currency) : null), [amount, currency]);
  const isMove = type === 'transfer' || type === 'savings';
  const kindCats = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'));

  // комиссия обмена для перевода
  const rates = useMemo(() => ratesMap(ratesList), [ratesList]);
  const toAccount = type === 'transfer' ? accounts.find((a) => a.id === toAccountId) : undefined;
  const expectedToMinor =
    amountMinor && toAccount ? convertMinor(amountMinor, currency, toAccount.currency, rates) : null;
  const receivedMinor = receivedStr ? parseAmountInput(receivedStr, toAccount?.currency ?? currency) : null;
  const commissionMinor =
    type === 'transfer' && toAccount && expectedToMinor && receivedMinor !== null && receivedMinor !== expectedToMinor
      ? expectedToMinor - receivedMinor
      : null;
  const fromAccount = accounts.find((a) => a.id === accountId);
  const commissionShown =
    commissionMinor && toAccount
      ? convertMinor(commissionMinor, toAccount.currency, fromAccount?.currency ?? currency, rates)
      : null;

  const submit = async () => {
    if (!amountMinor || amountMinor <= 0) {
      setError('Введите сумму');
      return;
    }
    if (!accountId) {
      setError('Выберите счёт');
      return;
    }
    if (isMove && !toAccountId) {
      setError('Выберите счёт назначения');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input: TxInput = {
        type,
        amount: amountMinor,
        currency,
        accountId,
        toAccountId: toAccountId ?? undefined,
        categoryId: categoryId ?? undefined,
        date,
        description,
        notes,
        goalId: goalId ?? undefined,
        ...(type === 'transfer' && receivedTouched && receivedMinor !== null ? { receivedAmount: receivedMinor } : {}),
      };
      const result = await saveTransaction(input, initial?.id);
      onSaved(result.id);
    } finally {
      setBusy(false);
    }
  };

  const typeOptions: Array<{ value: TxType; label: string; color?: string }> = [
    { value: 'expense', label: 'Расход', color: 'var(--color-danger)' },
    { value: 'income', label: 'Доход', color: 'var(--color-accent)' },
    { value: 'transfer', label: 'Перевод', color: 'var(--color-transfer)' },
    { value: 'savings', label: 'Накопление', color: 'var(--color-savings)' },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <Segmented value={type} options={typeOptions} onChange={setType} />

      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <Field label="Сумма">
            <Input
              inputMode="decimal"
              autoFocus={!initial?.amountMajor}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="num text-xl font-semibold"
            />
          </Field>
        </div>
        <Field label="Валюта">
          <Select value={currency} onChange={(e) => { currencyTouched.current = true; setCurrency(e.target.value); }} className="w-28">
            {COMMON_CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      {amountMinor !== null && (
        <p className="text-faint text-[13px] px-1 num">{formatMoney(amountMinor, currency)}</p>
      )}

      <div className="flex gap-2">
        <Field label={isMove ? 'Откуда' : 'Счёт'}>
          <Select value={accountId ?? ''} onChange={(e) => setAccountId(e.target.value || null)}>
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
            ))}
          </Select>
        </Field>
        {isMove && (
          <Field label={type === 'savings' ? 'Куда откладываю' : 'Куда'}>
            <Select value={toAccountId ?? ''} onChange={(e) => setToAccountId(e.target.value || null)}>
              <option value="">—</option>
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                ))}
            </Select>
          </Field>
        )}
      </div>

      {type === 'transfer' && toAccount && expectedToMinor !== null && (
        <div>
          <Field label={`Сколько придёт на «${toAccount.name}» (${toAccount.currency})`}>
            <Input
              inputMode="decimal"
              value={receivedStr !== '' ? receivedStr : String(toMajor(expectedToMinor, toAccount.currency))}
              onChange={(e) => { setReceivedTouched(true); setReceivedStr(e.target.value); }}
              className="num"
            />
          </Field>
          {commissionShown !== null && commissionShown !== 0 && (
            <p className="text-[12px] mt-1.5 px-1" style={{ color: commissionShown > 0 ? 'var(--color-warning)' : 'var(--color-accent)' }}>
              {commissionShown > 0
                ? `Комиссия: ${formatMoney(commissionShown, fromAccount?.currency ?? currency, { compact: true })} — запишется как расход «Обмен валют»`
                : `Выгоднее курса на ${formatMoney(-commissionShown, fromAccount?.currency ?? currency, { compact: true })}`}
            </p>
          )}
        </div>
      )}

      {!isMove && (
        <Field label="Категория">
          <Select value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)}>
            <option value="">—</option>
            {kindCats.map((c) => (
              <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
            ))}
          </Select>
        </Field>
      )}

      {type === 'savings' && (
        <Field label="Цель">
          <Select value={goalId ?? ''} onChange={(e) => setGoalId(e.target.value || null)}>
            <option value="">Без цели</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
        </Field>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <Field label="Дата">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Описание">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Необязательно" />
          </Field>
        </div>
      </div>

      <Field label="Заметки">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Детали, контекст…" rows={2} />
      </Field>

      {error && <p className="text-danger text-sm px-1">{error}</p>}

      <div className="flex gap-2 pt-1 pb-2">
        {onCancel && (
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
        )}
        <Button variant="primary" className="flex-[2]" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </Button>
      </div>
    </div>
  );
}
