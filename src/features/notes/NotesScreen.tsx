import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type NoteLinkType } from '@/db/db';
import { deleteNote, saveNote } from '@/services/entities';
import { formatDayRelative, todayISO } from '@/lib/dates';
import { Button, Card, Confirm, EmptyState, Field, Input, Select, Sheet, TextArea, TopBar } from '@/components/ui';

const LINK_LABELS: Record<NoteLinkType, string> = {
  none: 'Просто заметка', transaction: 'К операции', purchase: 'К покупке',
  category: 'К категории', goal: 'К цели', date: 'К дате',
};

export function NotesScreen({ onBack }: { onBack: () => void }) {
  const notes = useLiveQuery(() => db.notes.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [linkType, setLinkType] = useState<NoteLinkType>('none');
  const [linkId, setLinkId] = useState('');
  const [linkDate, setLinkDate] = useState(todayISO());

  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().limit(50).toArray(), []) ?? [];
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []) ?? [];
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? [];
  const purchases = useLiveQuery(() => db.purchases.orderBy('date').reverse().limit(50).toArray(), []) ?? [];

  const openEdit = async (id: string) => {
    const n = await db.notes.get(id);
    if (!n) return;
    setText(n.text);
    setLinkType(n.linkType);
    setLinkId(n.linkId ?? '');
    setLinkDate(n.linkDate ?? todayISO());
    setEditingId(id);
    setAdding(true);
  };

  const save = async () => {
    if (!text.trim()) return;
    await saveNote(
      { text, linkType, linkId: linkId || undefined, linkDate },
      editingId ?? undefined,
    );
    setAdding(false);
    setEditingId(null);
    setText('');
    setLinkType('none');
    setLinkId('');
  };

  const linkSummary = (n: (typeof notes)[number]): string | null => {
    switch (n.linkType) {
      case 'transaction': return `↔ ${transactions.find((t) => t.id === n.linkId)?.description?.trim() || 'операция'}`;
      case 'purchase': return `🛍 ${purchases.find((p) => p.id === n.linkId)?.name ?? 'покупка'}`;
      case 'category': return `${categories.find((c) => c.id === n.linkId)?.emoji ?? ''} ${categories.find((c) => c.id === n.linkId)?.name ?? 'категория'}`;
      case 'goal': return `🎯 ${goals.find((g) => g.id === n.linkId)?.name ?? 'цель'}`;
      case 'date': return `📅 ${n.linkDate ? formatDayRelative(n.linkDate) : ''}`;
      default: return null;
    }
  };

  return (
    <div className="pb-24">
      <TopBar
        title="Заметки"
        onBack={onBack}
        right={<button onClick={() => { setEditingId(null); setText(''); setLinkType('none'); setAdding(true); }} className="w-9 h-9 rounded-full bg-accent-dim text-accent text-xl leading-none">+</button>}
      />
      <div className="px-4 flex flex-col gap-2">
        {notes.length === 0 && (
          <EmptyState emoji="📝" title="Заметок нет" hint="Мысли о деньгах: решения, сомнения, наблюдения" />
        )}
        {notes.map((n) => {
          const link = linkSummary(n);
          return (
            <Card key={n.id} onClick={() => void openEdit(n.id)} className="!py-3">
              <p className="text-[15px] whitespace-pre-wrap break-words">{n.text}</p>
              <div className="flex justify-between mt-2 text-[12px] text-faint">
                <span>{link ?? 'просто заметка'}</span>
                <span>{formatDayRelative(n.createdAt.slice(0, 10))}</span>
              </div>
            </Card>
          );
        })}
      </div>

      <Sheet open={adding} onClose={() => { setAdding(false); setEditingId(null); }} title={editingId ? 'Заметка' : 'Новая заметка'}>
        <div className="flex flex-col gap-3.5 pt-2 pb-2">
          <TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            autoFocus
            placeholder="О чём думаете? «Пока не понимаю, стоит ли продолжать подписку»…"
          />
          <div className="flex gap-2">
            <Field label="Привязать к">
              <Select value={linkType} onChange={(e) => { setLinkType(e.target.value as NoteLinkType); setLinkId(''); }} className="w-44">
                {(Object.keys(LINK_LABELS) as NoteLinkType[]).map((t) => (
                  <option key={t} value={t}>{LINK_LABELS[t]}</option>
                ))}
              </Select>
            </Field>
            {linkType === 'date' && (
              <Field label="Дата">
                <Input type="date" value={linkDate} onChange={(e) => setLinkDate(e.target.value)} className="w-40" />
              </Field>
            )}
          </div>
          {linkType === 'transaction' && (
            <Field label="Операция">
              <Select value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                <option value="">—</option>
                {transactions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.date} · {t.description?.trim() || t.type} · {t.amount}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {linkType === 'purchase' && (
            <Field label="Покупка">
              <Select value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                <option value="">—</option>
                {purchases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          )}
          {linkType === 'category' && (
            <Field label="Категория">
              <Select value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </Select>
            </Field>
          )}
          {linkType === 'goal' && (
            <Field label="Цель">
              <Select value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                <option value="">—</option>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
          )}
          <div className="flex gap-2">
            {editingId && (
              <Button variant="danger" onClick={() => { void deleteNote(editingId); setAdding(false); setEditingId(null); }}>
                Удалить
              </Button>
            )}
            <Button variant="primary" className="flex-1" disabled={!text.trim()} onClick={() => void save()}>
              Сохранить
            </Button>
          </div>
        </div>
      </Sheet>

      <Confirm
        open={!!deleting}
        title="Удалить заметку?"
        onConfirm={() => { if (deleting) void deleteNote(deleting); }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
