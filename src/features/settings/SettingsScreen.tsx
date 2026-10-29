import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { changeBaseCurrency, updateSettings } from '@/services/settings';
import { fetchLiveRates } from '@/services/exchange';
import { formatDay } from '@/lib/dates';
import { saveRate } from '@/services/entities';
import { downloadCSV, downloadJSON, exportAllJSON, exportTransactionsCSV, generateDemoData, importAllJSON } from '@/services/exportImport';
import { COMMON_CURRENCY_CODES, currencyMeta } from '@/lib/money';
import { Button, Card, Confirm, Field, Input, SectionTitle, Select, Sheet, TopBar } from '@/components/ui';
import { useUI } from '@/store/ui';

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { showToast } = useUI();
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  const rates = useLiveQuery(() => db.exchangeRates.toArray(), []) ?? [];
  const [rateEdit, setRateEdit] = useState<string | null>(null);
  const [rateValue, setRateValue] = useState('');
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ratesBusy, setRatesBusy] = useState(false);

  if (!settings) return <div className="flex-1 flex items-center justify-center text-faint text-sm">Загрузка…</div>;

  const otherRates = rates.filter((r) => r.code !== settings.baseCurrency);

  const doExportJSON = async () => {
    const json = await exportAllJSON();
    downloadJSON(json);
    showToast('Экспорт сохранён ✓');
  };
  const doExportCSV = async () => {
    const csv = await exportTransactionsCSV();
    downloadCSV(csv);
    showToast('CSV сохранён ✓');
  };
  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      const res = await importAllJSON(text);
      showToast(`Импортировано: ${res.transactions} операций, ${res.accounts} счетов`);
    } catch (e) {
      showToast(`Ошибка импорта: ${e instanceof Error ? e.message : 'файл не распознан'}`);
    }
  };
  const doWipe = async () => {
    await db.transaction('rw', [db.settings, db.accounts, db.categories, db.transactions, db.goals, db.purchases, db.wishlist, db.budgets, db.recurring, db.notes, db.valuations, db.exchangeRates], async () => {
      await Promise.all([
        db.settings.clear(), db.accounts.clear(), db.categories.clear(), db.transactions.clear(),
        db.goals.clear(), db.purchases.clear(), db.wishlist.clear(), db.budgets.clear(),
        db.recurring.clear(), db.notes.clear(), db.valuations.clear(), db.exchangeRates.clear(),
      ]);
    });
    // пересоздаём настройки и категории заново
    location.reload();
  };

  return (
    <div className="pb-24">
      <TopBar title="Настройки" onBack={onBack} />
      <div className="px-4 flex flex-col gap-5">
        {/* Валюты */}
        <div>
          <SectionTitle>Валюты</SectionTitle>
          <Card className="flex flex-col gap-3">
            <Field label="Основная валюта">
              <Select value={settings.baseCurrency} onChange={(e) => void changeBaseCurrency(e.target.value)}>
                {COMMON_CURRENCY_CODES.map((c) => <option key={c} value={c}>{c} — {currencyMeta(c).name}</option>)}
              </Select>
            </Field>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] text-muted px-1">
                  Курсы к {settings.baseCurrency}
                  {settings.ratesUpdatedAt && (
                    <span className="text-faint"> · обновлены {formatDay(settings.ratesUpdatedAt.slice(0, 10))}</span>
                  )}
                  {!settings.ratesUpdatedAt && <span className="text-faint"> · стартовые, обновите</span>}
                </div>
                <button
                  className="text-accent text-[13px] shrink-0 pl-2"
                  onClick={async () => {
                    setRatesBusy(true);
                    try {
                      const res = await fetchLiveRates(settings.baseCurrency, true);
                      showToast(res ? `Курсы обновлены ✓ (${res.updated} валют)` : 'Не удалось обновить — нет сети');
                    } finally {
                      setRatesBusy(false);
                    }
                  }}
                >
                  {ratesBusy ? 'Обновляю…' : '↻ Обновить'}
                </button>
              </div>
              <label className="flex items-center justify-between gap-3 pb-2.5 mb-1 border-b border-border">
                <span className="text-[14px]">Автообновление курсов (при открытии)</span>
                <input
                  type="checkbox"
                  checked={settings.autoRates !== 0}
                  onChange={(e) => void updateSettings({ autoRates: e.target.checked ? 1 : 0 })}
                  className="w-5 h-5 accent-[var(--color-accent)] shrink-0"
                />
              </label>
              <p className="text-faint text-[12px] mb-2 px-1">
                Курс из реального API без ключей, обновляется ежедневно. «Обновить» перезаписывает всё;
                автоматика не трогает только курсы, отредактированные вручную.
              </p>
              <div className="flex flex-col gap-1.5">
                {otherRates.map((r) => (
                  <div key={r.code} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
                    <span className="text-[15px]">{r.code} <span className="text-faint text-[12px]">{currencyMeta(r.code).name}</span></span>
                    <button
                      className="num text-[15px] text-muted"
                      onClick={() => { setRateEdit(r.code); setRateValue(String(r.rate)); }}
                    >
                      {r.rate.toLocaleString('ru-RU', {
                        maximumFractionDigits: r.rate < 0.01 ? 6 : r.rate < 1 ? 4 : 2,
                      })} ✏️
                    </button>
                  </div>
                ))}
                {otherRates.length === 0 && <p className="text-faint text-sm">Других валют нет</p>}
              </div>
            </div>
          </Card>
        </div>

        {/* Поведение */}
        <div>
          <SectionTitle>Поведение</SectionTitle>
          <Card className="flex flex-col gap-3">
            <Field label="Язык распознавания речи">
              <Select value={settings.voiceLocale} onChange={(e) => void updateSettings({ voiceLocale: e.target.value })}>
                <option value="ru-RU">Русский (ru-RU)</option>
                <option value="en-US">English (en-US)</option>
                <option value="uz-UZ">O'zbek (uz-UZ)</option>
              </Select>
            </Field>
            <label className="flex items-center justify-between gap-3">
              <span className="text-[15px]">Автоматически проводить регулярные платежи</span>
              <input
                type="checkbox"
                checked={settings.autoCreateRecurring === 1}
                onChange={(e) => void updateSettings({ autoCreateRecurring: e.target.checked ? 1 : 0 })}
                className="w-5 h-5 accent-[var(--color-accent)]"
              />
            </label>
          </Card>
        </div>

        {/* Данные */}
        <div>
          <SectionTitle>Мои данные</SectionTitle>
          <Card className="flex flex-col gap-2.5">
            <p className="text-faint text-[13px]">
              Все данные хранятся только на этом устройстве. Регулярно сохраняйте резервную копию.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => void doExportJSON()}>Экспорт JSON</Button>
              <Button variant="secondary" className="flex-1" onClick={() => void doExportCSV()}>Экспорт CSV</Button>
            </div>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>Импорт из JSON (заменяет всё)</Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void doImport(f);
                e.target.value = '';
              }}
            />
          </Card>
        </div>

        {/* Демо и очистка */}
        <div>
          <SectionTitle>Демо и очистка</SectionTitle>
          <Card className="flex flex-col gap-2.5">
            <Button variant="secondary" onClick={() => setConfirmDemo(true)}>Загрузить демо-данные (4 месяца)</Button>
            <Button variant="danger" onClick={() => setConfirmWipe(true)}>Удалить все данные</Button>
          </Card>
        </div>

        <p className="text-faint text-[12px] text-center pb-4">
          Финансовый помощник · v0.1 · данные не покидают устройство
        </p>
      </div>

      {/* Редактор курса */}
      <Sheet open={!!rateEdit} onClose={() => setRateEdit(null)} title={`Курс ${rateEdit}`}>
        <div className="flex flex-col gap-3.5 pt-2 pb-2">
          <Field label={`1 ${rateEdit} = ? ${settings.baseCurrency}`}>
            <Input inputMode="decimal" value={rateValue} onChange={(e) => setRateValue(e.target.value)} className="num text-lg" />
          </Field>
          <p className="text-faint text-[13px] px-1">
            Курсы примерные — обновите под актуальные. Изменение применяется ко всем пересчётам сразу.
          </p>
          <Button
            variant="primary" size="lg"
            onClick={async () => {
              const v = parseFloat(rateValue.replace(',', '.'));
              if (!rateEdit || !Number.isFinite(v) || v <= 0) return;
              await saveRate(rateEdit, v);
              setRateEdit(null);
              showToast('Курс обновлён ✓');
            }}
          >
            Сохранить курс
          </Button>
        </div>
      </Sheet>

      <Confirm
        open={confirmDemo}
        title="Загрузить демо-данные?"
        text="Будет создано ~4 месяца правдоподобных операций в существующие счета. Потом их можно удалить кнопкой «Удалить все данные»."
        confirmLabel="Загрузить"
        danger={false}
        onConfirm={() => {
          void generateDemoData()
            .then(() => showToast('Демо-данные загружены ✓'))
            .catch((e) => showToast(e instanceof Error ? e.message : 'Ошибка'));
        }}
        onClose={() => setConfirmDemo(false)}
      />
      <Confirm
        open={confirmWipe}
        title="Удалить ВСЕ данные?"
        text="Счета, операции, цели, покупки — всё будет стерто без возможности восстановления. Сначала сделайте экспорт!"
        confirmLabel="Удалить всё"
        onConfirm={() => void doWipe()}
        onClose={() => setConfirmWipe(false)}
      />
    </div>
  );
}
