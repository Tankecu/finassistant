import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Category } from '@/db/db';
import { canDeleteCategory, createCategory, deleteCategory, updateCategory } from '@/services/entities';
import { CATEGORY_SEEDS } from '@/db/seed';
import { Button, Card, Confirm, Field, Input, Segmented, Sheet, TopBar } from '@/components/ui';

const EMOJI_CHOICES = ['🍔', '🚕', '🏠', '💊', '📚', '🎮', '💻', '👕', '🔄', '📱', '💼', '📦', '💰', '🎁', '✨', '☕', '🐾', '🚲', '✈️', '🎓', '🎨', '⚽', '🧾', '🏪'];

export function CategoriesScreen({ onBack }: { onBack: () => void }) {
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []) ?? [];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const expense = categories.filter((c) => c.kind === 'expense');
  const income = categories.filter((c) => c.kind === 'income');

  return (
    <div className="pb-24">
      <TopBar
        title="Категории"
        onBack={onBack}
        right={<button onClick={() => { setEditing(null); setAdding(true); }} className="w-9 h-9 rounded-full bg-accent-dim text-accent text-xl leading-none">+</button>}
      />
      <div className="px-4 flex flex-col gap-3">
        <p className="text-faint text-[13px] px-1">
          Ключевые слова помогают быстрому вводу распознавать категорию: «самса» → Еда.
        </p>
        <CategoryGroup title="Расходы" list={expense} all={categories} onEdit={setEditing} onDelete={setDeleting} />
        <CategoryGroup title="Доходы" list={income} all={categories} onEdit={setEditing} onDelete={setDeleting} />
      </div>

      <CategoryFormSheet open={adding} editing={editing} onClose={() => setAdding(false)} />
      <Confirm
        open={!!deleting}
        title={`Удалить «${deleting?.name}»?`}
        text="Операции останутся без категории."
        onConfirm={() => { if (deleting) void deleteCategory(deleting.id); }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function CategoryGroup({
  title,
  list,
  all,
  onEdit,
  onDelete,
}: {
  title: string;
  list: Category[];
  all: Category[];
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
}) {
  return (
    <div>
      <h3 className="text-[13px] uppercase tracking-wider text-faint px-1 mb-2">{title}</h3>
      <Card className="!py-1">
        {list.map((c, i) => (
          <div key={c.id} className={`flex items-center gap-3 py-2.5 ${i < list.length - 1 ? 'border-b border-border' : ''}`}>
            <span className="text-lg w-7 text-center">{c.emoji}</span>
            <div className="flex-1 min-w-0" onClick={() => onEdit(c)}>
              <div className="text-[15px] cursor-pointer">{c.name}</div>
              {c.keywords.length > 0 && (
                <div className="text-[11px] text-faint truncate">{c.keywords.slice(0, 6).join(', ')}{c.keywords.length > 6 ? ` +${c.keywords.length - 6}` : ''}</div>
              )}
            </div>
            {canDeleteCategory(c, all) && (
              <button onClick={() => onDelete(c)} className="text-faint text-[13px] px-1">удалить</button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

function CategoryFormSheet({ open, editing, onClose }: { open: boolean; editing: Category | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [emoji, setEmoji] = useState('📦');
  const [keywords, setKeywords] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);

  if (open && editing && loaded !== editing.id) {
    setLoaded(editing.id);
    setName(editing.name);
    setKind(editing.kind);
    setEmoji(editing.emoji);
    setKeywords(editing.keywords.join(', '));
  }
  if (open && !editing && loaded !== 'new') {
    setLoaded('new');
    setName(''); setKind('expense'); setEmoji('📦'); setKeywords('');
  }
  if (!open && loaded !== null) setLoaded(null);

  const save = async () => {
    if (!name.trim()) return;
    const kw = keywords.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (editing) {
      await updateCategory(editing.id, { name: name.trim(), kind, emoji, keywords: kw });
    } else {
      await createCategory({ name: name.trim(), kind, emoji, keywords: kw });
    }
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Категория' : 'Новая категория'}>
      <div className="flex flex-col gap-3.5 pt-2 pb-2">
        <Segmented
          value={kind}
          options={[{ value: 'expense', label: 'Расход' }, { value: 'income', label: 'Доход' }]}
          onChange={setKind}
        />
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Еда, Транспорт…" />
        </Field>
        <Field label="Иконка">
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`w-10 h-10 rounded-xl text-lg ${emoji === e ? 'bg-accent-dim border border-accent/70' : 'bg-surface-2 border border-border'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Ключевые слова (через запятую)">
          <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="кофе, обед, самса" />
        </Field>
        {!editing && (
          <div className="text-[13px] text-faint px-1">
            Подсказка: в системных категориях уже есть словари — {CATEGORY_SEEDS[0].keywords.slice(0, 4).join(', ')}…
          </div>
        )}
        <Button variant="primary" size="lg" onClick={() => void save()}>Сохранить</Button>
      </div>
    </Sheet>
  );
}
