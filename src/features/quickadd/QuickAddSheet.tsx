import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type TxType } from '@/db/db';
import { parseQuickInput } from '@/services/parser/parse';
import type { ParserContext } from '@/services/parser/types';
import { saveTransaction } from '@/services/transactions';
import { createAccount, suggestAccountColor } from '@/services/accounts';
import { createPurchase } from '@/services/entities';
import { COMMON_CURRENCY_CODES, convertMinor, formatMoney, parseAmountInput, ratesMap, toMajor } from '@/lib/money';
import { hapticSuccess } from '@/lib/telegram';
import { formatDayRelative, todayISO } from '@/lib/dates';
import { getSpeechProvider } from '@/services/speech';
import { Button, Chip, Input, Sheet } from '@/components/ui';
import { TransactionForm } from '@/features/transactions/TransactionForm';
import { useUI } from '@/store/ui';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<TxType, string> = {
  expense: 'Расход', income: 'Доход', transfer: 'Перевод', savings: 'Накопление',
};
const TYPE_COLORS: Record<TxType, string> = {
  expense: 'var(--color-danger)', income: 'var(--color-accent)',
  transfer: 'var(--color-transfer)', savings: 'var(--color-savings)',
};

const EXAMPLES = ['потратил 35к на еду', 'получил 500$ за работу', 'отложил 100$ на цель', 'купил кофе 25к'];

interface Overrides {
  type?: TxType | null;
  amountMajor?: number | null;
  currency?: string | null;
  categoryId?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
  goalId?: string | null;
  date?: string | null;
}

export function QuickAddSheet() {
  const { quickAddOpen, quickAddPreset, closeQuickAdd, showToast } = useUI();
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.archived).sortBy('sortOrder'), []) ?? [];
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []) ?? [];
  const goals = useLiveQuery(() => db.goals.where('status').equals('active').toArray(), []) ?? [];
  const ratesList = useLiveQuery(() => db.exchangeRates.toArray(), []) ?? [];

  const [text, setText] = useState('');
  const [mode, setMode] = useState<'quick' | 'manual'>('quick');
  const [ov, setOv] = useState<Overrides>({});
  const [asPurchase, setAsPurchase] = useState(false);
  const [purchaseName, setPurchaseName] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const stopSpeech = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const baseCurrency = settings?.baseCurrency ?? 'UZS';

  useEffect(() => {
    if (quickAddOpen) {
      setText('');
      setOv({});
      setAsPurchase(quickAddPreset?.purchase ?? false);
      setPurchaseName('');
      setMode('quick');
      setVoiceHint(null);
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [quickAddOpen, quickAddPreset]);

  const ctx: ParserContext = useMemo(
    () => ({
      baseCurrency,
      categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, keywords: c.keywords, sortOrder: c.sortOrder })),
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, currency: a.currency })),
      goals: goals.map((g) => ({ id: g.id, name: g.name, linkedAccountId: g.linkedAccountId })),
      lastAccountId: settings?.lastAccountId,
      today: todayISO(),
    }),
    [baseCurrency, categories, accounts, goals, settings?.lastAccountId],
  );

  const parsed = useMemo(
    () => (text.trim().length > 0 ? parseQuickInput(text, ctx) : null),
    [text, ctx],
  );

  const type: TxType = ov.type ?? quickAddPreset?.type ?? parsed?.type ?? 'expense';
  const amountMajor = ov.amountMajor ?? parsed?.amountMajor ?? null;
  const currency = ov.currency ?? parsed?.currency ?? baseCurrency;
  const categoryId = ov.categoryId !== undefined ? ov.categoryId : (parsed?.categoryId ?? null);
  const accountId = ov.accountId ?? parsed?.accountId ?? accounts.find((a) => a.kind === 'card' || a.kind === 'cash')?.id ?? accounts[0]?.id ?? null;
  const toAccountId = ov.toAccountId ?? parsed?.toAccountId ?? null;
  const goalId = ov.goalId !== undefined ? ov.goalId : (quickAddPreset?.goalId ?? parsed?.goalId ?? null);
  const date = ov.date ?? parsed?.date ?? todayISO();

  const amountMinor = amountMajor != null ? parseAmountInput(String(amountMajor), currency) : null;
  const isMove = type === 'transfer' || type === 'savings';
  const kindCats = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'));

  // ── комиссия обмена: сколько реально придёт на счёт назначения ──
  const [receivedStr, setReceivedStr] = useState('');
  const [lastToKey, setLastToKey] = useState('');
  const toKey = `${toAccountId ?? ''}|${amountMinor ?? ''}|${currency}|${type}`;
  useEffect(() => {
    if (toKey !== lastToKey) {
      setLastToKey(toKey);
      setReceivedStr('');
    }
  }, [toKey, lastToKey]);
  const rates = useMemo(() => ratesMap(ratesList), [ratesList]);
  const toAccount = type === 'transfer' ? accounts.find((a) => a.id === toAccountId) : undefined;
  const expectedToMinor =
    amountMinor && toAccount
      ? convertMinor(amountMinor, currency, toAccount.currency, rates)
      : null;
  const receivedOverride = receivedStr ? parseAmountInput(receivedStr, toAccount?.currency ?? currency) : null;
  const commissionMinor =
    type === 'transfer' && toAccount && expectedToMinor && receivedOverride !== null && receivedOverride !== expectedToMinor
      ? expectedToMinor - receivedOverride
      : null;

  // ── голос ──
  const speech = useMemo(() => getSpeechProvider(), []);
  const toggleMic = () => {
    if (listening) {
      stopSpeech.current?.();
      setListening(false);
      return;
    }
    setVoiceHint(null);
    const stop = speech.listen({
      locale: settings?.voiceLocale ?? 'ru-RU',
      onPartial: (t) => setText((prev) => (t.length > prev.length ? t : prev)),
      onFinal: (t) => {
        setText(t);
        setListening(false);
        stopSpeech.current = null;
      },
      onError: (msg) => {
        setVoiceHint(msg);
        setListening(false);
        stopSpeech.current = null;
      },
    });
    stopSpeech.current = stop;
    setListening(true);
  };
  useEffect(() => () => stopSpeech.current?.(), []);

  // ── сохранение ──
  const save = async () => {
    if (!amountMinor || amountMinor <= 0) return;
    setBusy(true);
    try {
      let finalToAccount = toAccountId;
      if (type === 'savings' && !finalToAccount) {
        let savingsAcc = accounts.find((a) => a.kind === 'savings');
        if (!savingsAcc) {
          const id = await createAccount({
            name: 'Накопления', kind: 'savings', currency: baseCurrency,
            openingBalance: 0, color: suggestAccountColor('savings'),
          });
          savingsAcc = { id, name: 'Накопления', kind: 'savings', currency: baseCurrency, openingBalance: 0, archived: 0, sortOrder: 99, createdAt: '' };
        }
        finalToAccount = savingsAcc.id;
      }
      if (!accountId) {
        showToast('Сначала создайте счёт в разделе «Счета»');
        return;
      }
      if (isMove && !finalToAccount) {
        showToast('Выберите счёт назначения');
        return;
      }
      const result = await saveTransaction({
        type,
        amount: amountMinor,
        currency,
        accountId,
        toAccountId: finalToAccount ?? undefined,
        categoryId: categoryId ?? undefined,
        date,
        description: text.trim() || undefined,
        goalId: type === 'savings' ? (goalId ?? undefined) : undefined,
        ...(type === 'transfer' && receivedOverride !== null ? { receivedAmount: receivedOverride } : {}),
      });
      if (asPurchase) {
        await createPurchase({
          name: purchaseName.trim() || parsed?.purchaseName?.trim() || text.trim().slice(0, 40) || 'Покупка',
          amount: amountMinor,
          currency,
          date,
          categoryId: categoryId ?? undefined,
          transactionId: result.id,
        });
      }
      const notes = [result.convertedNote, result.commissionNote].filter(Boolean).join(', ');
      showToast(notes ? `Сохранено ✓ (${notes})` : 'Сохранено ✓');
      hapticSuccess();
      closeQuickAdd();
    } finally {
      setBusy(false);
    }
  };

  if (!quickAddOpen) return null;

  const missingAmount = amountMinor === null || amountMinor <= 0;

  return (
    <Sheet open={quickAddOpen} onClose={closeQuickAdd}>
      {mode === 'manual' ? (
        <div className="pt-1">
          <TransactionForm
            initial={{
              type,
              amountMajor,
              currency,
              accountId,
              toAccountId,
              categoryId,
              date,
              description: text.trim() || undefined,
              goalId,
            }}
            onSaved={() => { showToast('Сохранено ✓'); closeQuickAdd(); }}
            onCancel={() => setMode('quick')}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 pt-2">
          {/* строка ввода */}
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Что произошло? Например: потратил 35к на еду"
              className="flex-1 bg-surface-2 border border-border rounded-2xl px-4 py-3.5 text-[15px] outline-none focus:border-accent/60 placeholder:text-faint"
              enterKeyHint="done"
            />
            <button
              onClick={toggleMic}
              aria-label="Голосовой ввод"
              className={cn(
                'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors',
                listening ? 'bg-danger text-white animate-pulse' : 'bg-surface-2 border border-border text-muted',
              )}
            >
              <MicIcon />
            </button>
          </div>
          {listening && <p className="text-accent text-[13px] px-1">Слушаю… говорите</p>}
          {voiceHint && !listening && <p className="text-warning text-[13px] px-1">{voiceHint}</p>}

          {/* примеры */}
          {!text && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
              {EXAMPLES.map((ex) => (
                <Chip key={ex} onClick={() => setText(ex)}>{ex}</Chip>
              ))}
            </div>
          )}

          {/* предпросмотр */}
          <div className="bg-surface-2 border border-border rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <div className="text-[12px] text-faint mb-0.5">{TYPE_LABELS[type]}</div>
                {missingAmount ? (
                  <input
                    autoFocus={!!parsed && !parsed.amountMajor}
                    inputMode="decimal"
                    value={ov.amountMajor != null ? String(ov.amountMajor) : ''}
                    onChange={(e) => setOv((o) => ({ ...o, amountMajor: e.target.value ? Number(e.target.value.replace(',', '.')) : null }))}
                    placeholder="Сколько?"
                    className="num text-3xl font-bold bg-transparent outline-none placeholder:text-faint w-40"
                  />
                ) : (
                  <div className="num text-3xl font-bold" style={{ color: TYPE_COLORS[type] }}>
                    {formatMoney(amountMinor!, currency, { sign: type === 'income' ? 'auto' : undefined })}
                  </div>
                )}
              </div>
              <select
                value={currency}
                onChange={(e) => setOv((o) => ({ ...o, currency: e.target.value }))}
                className="bg-transparent text-muted text-sm outline-none border border-border rounded-lg px-2 py-1 self-center"
              >
                {COMMON_CURRENCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* тип */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
              {(Object.keys(TYPE_LABELS) as TxType[]).map((t) => (
                <Chip key={t} active={type === t} color={TYPE_COLORS[t]} onClick={() => setOv((o) => ({ ...o, type: t }))}>
                  {TYPE_LABELS[t]}
                </Chip>
              ))}
            </div>

            {/* категория */}
            {!isMove && (
              <div>
                <div className="text-[12px] text-faint mb-1.5">Категория</div>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
                  {kindCats.map((c) => (
                    <Chip
                      key={c.id}
                      active={categoryId === c.id}
                      color={c.color}
                      onClick={() => setOv((o) => ({ ...o, categoryId: c.id }))}
                    >
                      {c.emoji} {c.name}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {/* счета */}
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-36">
                <div className="text-[12px] text-faint mb-1.5">{isMove ? 'Откуда' : 'Счёт'}</div>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {accounts.map((a) => (
                    <Chip key={a.id} active={accountId === a.id} onClick={() => setOv((o) => ({ ...o, accountId: a.id }))}>
                      {a.name}
                    </Chip>
                  ))}
                  {accounts.length === 0 && <span className="text-faint text-sm">Создайте счёт</span>}
                </div>
              </div>
              {isMove && (
                <div className="flex-1 min-w-36">
                  <div className="text-[12px] text-faint mb-1.5">{type === 'savings' ? 'Куда откладываю' : 'Куда'}</div>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    {accounts.filter((a) => a.id !== accountId).map((a) => (
                      <Chip key={a.id} active={toAccountId === a.id} onClick={() => setOv((o) => ({ ...o, toAccountId: a.id }))}>
                        {a.name}
                      </Chip>
                    ))}
                    {accounts.filter((a) => a.id !== accountId).length === 0 && (
                      <span className="text-faint text-sm">Нужен второй счёт</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* комиссия обмена: сколько реально придёт */}
            {type === 'transfer' && toAccount && expectedToMinor !== null && (
              <div>
                <div className="text-[12px] text-faint mb-1.5">
                  Получите на «{toAccount.name}» ({toAccount.currency})
                </div>
                <div className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={receivedStr !== '' ? receivedStr : (expectedToMinor != null ? String(toMajor(expectedToMinor, toAccount.currency)) : '')}
                    onChange={(e) => setReceivedStr(e.target.value)}
                    placeholder="0"
                    className="num bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[15px] outline-none focus:border-accent/60 w-32"
                  />
                  {receivedStr !== '' && parseAmountInput(receivedStr, toAccount.currency) === expectedToMinor && (
                    <button onClick={() => setReceivedStr('')} className="text-faint text-[12px] underline underline-offset-2">авто</button>
                  )}
                </div>
                {commissionMinor !== null && commissionMinor !== 0 && (
                  <div className="text-[12px] mt-1.5" style={{ color: commissionMinor > 0 ? 'var(--color-warning)' : 'var(--color-accent)' }}>
                    {commissionMinor > 0
                      ? `Комиссия: ${formatMoney(commissionMinor, currency, { compact: true })} — запишется как расход «Обмен валют»`
                      : `Выгоднее курса на ${formatMoney(-commissionMinor, currency, { compact: true })}`}
                  </div>
                )}
              </div>
            )}

            {/* цель для накопления */}
            {type === 'savings' && (
              <div>
                <div className="text-[12px] text-faint mb-1.5">Цель</div>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
                  {goals.map((g) => (
                    <Chip key={g.id} active={goalId === g.id} onClick={() => setOv((o) => ({ ...o, goalId: g.id }))}>
                      🎯 {g.name}
                    </Chip>
                  ))}
                  {goals.length === 0 && <span className="text-faint text-sm">Целей пока нет</span>}
                </div>
              </div>
            )}

            {/* дата */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-faint">Дата</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setOv((o) => ({ ...o, date: e.target.value }))}
                className="bg-surface border border-border rounded-lg px-2 py-1 text-sm outline-none"
              />
              <span className="text-[12px] text-faint">{date === todayISO() ? 'сегодня' : formatDayRelative(date)}</span>
            </div>

            {/* покупка */}
            {(type === 'expense') && (
              <label className="flex items-center gap-2.5 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={asPurchase}
                  onChange={(e) => setAsPurchase(e.target.checked)}
                  className="w-5 h-5 accent-[var(--color-accent)] shrink-0"
                />
                Сохранить как покупку
                {asPurchase && (
                  <Input
                    value={purchaseName}
                    onChange={(e) => setPurchaseName(e.target.value)}
                    placeholder={parsed?.purchaseName ?? 'Что купил?'}
                    className="!py-2 !text-sm flex-1"
                  />
                )}
              </label>
            )}
          </div>

          <Button
            variant="primary"
            size="lg"
            disabled={busy || missingAmount || (type === 'transfer' && (!toAccountId || accountId === toAccountId))}
            onClick={() => void save()}
          >
            {busy ? 'Сохраняю…' : amountMinor ? `Сохранить · ${formatMoney(amountMinor, currency)}` : 'Сохранить'}
          </Button>
          <button onClick={() => setMode('manual')} className="text-muted text-sm underline underline-offset-4 pb-2 self-center">
            Указать всё подробно
          </button>
          {parsed?.purchaseName && !asPurchase && type === 'expense' && (
            <button onClick={() => { setAsPurchase(true); setPurchaseName(parsed.purchaseName!); }} className="text-accent text-[13px] self-center -mt-1 mb-1">
              💡 Это покупка «{parsed.purchaseName}» — сохранить карточку?
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
    </svg>
  );
}
