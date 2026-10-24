import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ACCOUNT_KIND_LABELS, type Account, type AccountKind, type Transaction, type Valuation } from '@/db/db';
import { createAccount, deleteAccount, suggestAccountColor, updateAccount } from '@/services/accounts';
import { addValuation, deleteValuation } from '@/services/entities';
import { computePosition, accountValue } from '@/services/selectors';
import { useSnapshot } from '@/services/useSnapshot';
import { formatMoney, parseAmountInput, toMajor, COMMON_CURRENCY_CODES, currencyMeta } from '@/lib/money';
import { todayISO, formatDay } from '@/lib/dates';
import { Button, Card, Confirm, EmptyState, Field, Input, SectionTitle, Select, Sheet, TextArea, TopBar } from '@/components/ui';
import { cn } from '@/lib/utils';

const KINDS: AccountKind[] = ['cash', 'card', 'bank', 'ewallet', 'savings', 'investment', 'crypto', 'asset', 'liability'];
const NEEDS_VALUATION: AccountKind[] = ['investment', 'crypto', 'asset', 'liability'];

export function AccountsScreen({ onBack }: { onBack: () => void }) {
  const snap = useSnapshot();
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);

  if (!snap) return <div className="flex-1 flex items-center justify-center text-faint text-sm">Загрузка…</div>;


  const pos = computePosition(snap);
  const archived = snap.accounts.filter((a) => a.archived);

  return (
    <div className="pb-24">
      <TopBar
        title="Счета и активы"
        onBack={onBack}
        right={
          <button onClick={() => setFormOpen(true)} className="w-9 h-9 rounded-full bg-accent-dim text-accent text-xl leading-none">+</button>
        }
      />

      <div className="px-4 flex flex-col gap-4">
        <Card className="!py-3.5">
          <div className="flex justify-between items-baseline">
            <span className="text-[13px] text-muted">Капитал (активы − долги)</span>
            <span className="text-[12px] text-faint">в {snap.baseCurrency}</span>
          </div>
          <div className="num text-[30px] font-bold mt-1">{formatMoney(pos.netWorth, snap.baseCurrency, { compact: pos.netWorth >= 100_000_000 })}</div>
          <div className="flex gap-4 mt-2 text-[13px] text-muted">
            <span>Активы: <b className="num text-accent">{formatMoney(pos.assets, snap.baseCurrency, { compact: true })}</b></span>
            <span>Долги: <b className="num text-danger">{formatMoney(pos.liabilities, snap.baseCurrency, { compact: true })}</b></span>
          </div>
        </Card>

        <AccountList title="Деньги" items={pos.liquidAccounts} base={snap.baseCurrency} onOpen={setDetailId} />
        <AccountList title="Накопления и инвестиции" items={pos.savedAccounts} base={snap.baseCurrency} onOpen={setDetailId} />
        <AccountList title="Другие активы" items={pos.assetAccounts} base={snap.baseCurrency} onOpen={setDetailId} />
        <AccountList title="Обязательства" items={pos.liabilityAccounts} base={snap.baseCurrency} onOpen={setDetailId} />

        {pos.liquidAccounts.length + pos.savedAccounts.length + pos.assetAccounts.length + pos.liabilityAccounts.length === 0 && (
          <EmptyState emoji="👛" title="Счетов нет" hint="Добавьте наличные, карту или актив — и балансы начнут считаться" />
        )}

        {archived.length > 0 && (
          <>
            <SectionTitle>Архив</SectionTitle>
            {archived.map((a) => (
              <Card key={a.id} className="opacity-60 !py-3" onClick={() => setDetailId(a.id)}>
                <div className="flex justify-between text-sm"><span>{a.name}</span><span className="text-faint">в архиве</span></div>
              </Card>
            ))}
          </>
        )}
      </div>

      <AccountFormSheet open={formOpen} onClose={() => setFormOpen(false)} baseCurrency={snap.baseCurrency} />

      <AccountDetailSheet
        id={detailId}
        onClose={() => setDetailId(null)}
        onDelete={(acc) => { setDetailId(null); setDeleting(acc); }}
      />

      <Confirm
        open={!!deleting}
        title={`Удалить «${deleting?.name}»?`}
        text="Вместе со счётом удалятся все связанные операции и оценки. Действие необратимо."
        onConfirm={() => { if (deleting) void deleteAccount(deleting.id); }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function AccountList({
  title,
  items,
  base,
  onOpen,
}: {
  title: string;
  items: Array<{ account: Account; value: number; valueBase: number }>;
  base: string;
  onOpen: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const total = items.reduce((s, x) => s + x.valueBase, 0);
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <Card className="!py-1.5">
        {items.map(({ account, value, valueBase }, i) => (
          <div
            key={account.id}
            onClick={() => onOpen(account.id)}
            className={cn('flex items-center gap-3 py-2.5 active:opacity-70 cursor-pointer', i < items.length - 1 && 'border-b border-border')}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: account.color ?? '#64748b' }} />
            <div className="flex-1 min-w-0">
              <div className="text-[15px] truncate">{account.name}</div>
              <div className="text-[12px] text-faint">{ACCOUNT_KIND_LABELS[account.kind]} · {account.currency}</div>
            </div>
            <div className="text-right">
              <div className="num font-semibold text-[15px]">{formatMoney(value, account.currency, { compact: true })}</div>
              {account.currency !== base && <div className="num text-[11px] text-faint">{formatMoney(valueBase, base, { compact: true })}</div>}
            </div>
          </div>
        ))}
        <div className="flex justify-between pt-2 pb-1.5 px-0 border-t border-border mt-1">
          <span className="text-muted text-[13px]">Всего</span>
          <span className="num text-[13px] font-semibold">{formatMoney(total, base, { compact: true })}</span>
        </div>
      </Card>
    </div>
  );
}

function AccountFormSheet({ open, onClose, baseCurrency }: { open: boolean; onClose: () => void; baseCurrency: string }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('card');
  const [currency, setCurrency] = useState(baseCurrency);
  const [balance, setBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setName(''); setBalance(''); setNotes(''); setKind('card'); setCurrency(baseCurrency); };

  const save = async () => {
    setBusy(true);
    try {
      const minor = parseAmountInput(balance || '0', currency) ?? 0;
      await createAccount({
        name: name.trim() || ACCOUNT_KIND_LABELS[kind],
        kind,
        currency,
        openingBalance: kind === 'liability' ? minor : minor,
        color: suggestAccountColor(kind),
        notes,
      });
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Новый счёт или актив">
      <div className="flex flex-col gap-3.5 pt-2 pb-2">
        <Field label="Тип">
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                onClick={() => { setKind(k); if (NEEDS_VALUATION.includes(k) && k !== 'liability') setCurrency(currency); }}
                className={cn(
                  'rounded-xl border px-2 py-2.5 text-[13px]',
                  kind === k ? 'border-accent/70 bg-accent-dim text-accent' : 'border-border bg-surface-2 text-muted',
                )}
              >
                {ACCOUNT_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={ACCOUNT_KIND_LABELS[kind]} />
        </Field>
        <div className="flex gap-2">
          <Field label="Валюта">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-28">
              {COMMON_CURRENCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <div className="flex-1">
            <Field label={kind === 'liability' ? 'Сколько должны' : 'Текущая стоимость / баланс'}>
              <Input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0" className="num" />
            </Field>
          </div>
        </div>
        {NEEDS_VALUATION.includes(kind) && (
          <p className="text-faint text-[13px] px-1">
            {kind === 'liability'
              ? 'Долг уменьшается переводами на этот счёт; стоимость можно корректировать оценками.'
              : 'Стоимость таких активов обновляется вручную через «Оценку» — с историей изменений.'}
          </p>
        )}
        <Field label="Заметки">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Банк, условия, для чего…" />
        </Field>
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void save()}>
          {busy ? 'Сохраняю…' : 'Создать'}
        </Button>
      </div>
    </Sheet>
  );
}

function AccountDetailSheet({
  id,
  onClose,
  onDelete,
}: {
  id: string | null;
  onClose: () => void;
  onDelete: (acc: Account) => void;
}) {
  const account = useLiveQuery(() => (id ? db.accounts.get(id) : undefined), [id]);
  const valuations = useLiveQuery(
    () => (id ? db.valuations.where('accountId').equals(id).reverse().sortBy('date') : Promise.resolve([] as Valuation[])),
    [id],
  ) ?? [];
  const snap = useSnapshot();
  const [valOpen, setValOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [valAmount, setValAmount] = useState('');
  const [valDate, setValDate] = useState(todayISO());

  const value = useMemo(() => (account && snap ? accountValue(account, snap) : 0), [account, snap]);
  const recentTxs = useLiveQuery(
    () => {
      if (!id) return Promise.resolve([]);
      return db.transactions.orderBy('date').reverse().filter((t) => t.accountId === id || t.toAccountId === id).limit(5).toArray() as Promise<Transaction[]>;
    },
    [id],
  ) ?? [];

  // заполняем форму правки при открытии шита
  const [editLoaded, setEditLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (id && account && editLoaded !== id) {
      setName(account.name);
      setNotes(account.notes ?? '');
      setEditLoaded(id);
    }
    if (!id && editLoaded !== null) setEditLoaded(null);
  }, [id, account, editLoaded]);

  if (!id || !account || !snap) return null;
  const isValuated = NEEDS_VALUATION.includes(account.kind);

  return (
    <>
      <Sheet open={!!id} onClose={onClose} title={account.name}>
        <div className="flex flex-col gap-4 pt-1 pb-2">
          <div className="text-center">
            <div className="num text-3xl font-bold">{formatMoney(value, account.currency)}</div>
            <div className="text-[13px] text-faint mt-1">{ACCOUNT_KIND_LABELS[account.kind]} · {currencyMeta(account.currency).name}</div>
          </div>

          {account.notes && <p className="text-sm text-muted bg-surface-2 rounded-xl p-3 border border-border">{account.notes}</p>}

          {isValuated && (
            <div>
              <SectionTitle>История стоимости</SectionTitle>
              <Card className="!py-1">
                {valuations.length === 0 && <p className="text-faint text-sm py-3 text-center">Оценок ещё нет</p>}
                {valuations.map((v, i) => (
                  <div key={v.id} className={cn('flex justify-between items-center py-2.5', i < valuations.length - 1 && 'border-b border-border')}>
                    <div>
                      <div className="num text-[15px]">{formatMoney(v.value, account.currency)}</div>
                      <div className="text-[12px] text-faint">{formatDay(v.date)}{v.note ? ` · ${v.note}` : ''}</div>
                    </div>
                    <button onClick={() => void deleteValuation(v.id)} className="text-faint text-sm px-2">удалить</button>
                  </div>
                ))}
              </Card>
              <Button variant="accent-soft" className="w-full mt-2" onClick={() => { setValAmount(String(toMajor(value, account.currency))); setValDate(todayISO()); setValOpen(true); }}>
                Оценить сейчас
              </Button>
            </div>
          )}

          <div>
            <SectionTitle>Последние операции</SectionTitle>
            <Card className="!py-1">
              {recentTxs.length === 0 && <p className="text-faint text-sm py-3 text-center">Операций ещё нет</p>}
              {recentTxs.map((t, i) => (
                <div key={t.id} className={cn('flex justify-between py-2.5', i < recentTxs.length - 1 && 'border-b border-border')}>
                  <span className="text-[14px] truncate max-w-[60%]">{t.description?.trim() || 'Операция'}</span>
                  <span className="num text-[14px]">{formatMoney(t.amount, t.currency, { compact: true })}</span>
                </div>
              ))}
            </Card>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditOpen(true)}>Изменить</Button>
            <Button
              variant="ghost"
              onClick={() => void updateAccount(account.id, { archived: account.archived ? 0 : 1 })}
            >
              {account.archived ? 'Вернуть' : 'В архив'}
            </Button>
            <Button variant="danger" onClick={() => onDelete(account)}>Удалить</Button>
          </div>
        </div>
      </Sheet>

      {/* Быстрая правка */}
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Изменить счёт">
        <div className="flex flex-col gap-3.5 pt-2 pb-2">
          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Заметки">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
          <Button
            variant="primary" size="lg"
            onClick={async () => {
              await updateAccount(account.id, { name, notes });
              setEditOpen(false);
            }}
          >
            Сохранить
          </Button>
        </div>
      </Sheet>

      {/* Новая оценка */}
      <Sheet open={valOpen} onClose={() => setValOpen(false)} title="Оценка актива">
        <div className="flex flex-col gap-3.5 pt-2 pb-2">
          <Field label={`Стоимость (${account.currency})`}>
            <Input inputMode="decimal" value={valAmount} onChange={(e) => setValAmount(e.target.value)} className="num" />
          </Field>
          <Field label="Дата">
            <Input type="date" value={valDate} onChange={(e) => setValDate(e.target.value)} />
          </Field>
          <Button
            variant="primary" size="lg"
            onClick={async () => {
              const minor = parseAmountInput(valAmount, account.currency);
              if (minor === null) return;
              await addValuation(account.id, valDate, minor);
              setValOpen(false);
            }}
          >
            Сохранить оценку
          </Button>
        </div>
      </Sheet>
    </>
  );
}
