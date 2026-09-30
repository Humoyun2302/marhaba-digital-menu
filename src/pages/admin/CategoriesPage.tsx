import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/toast-context";
import {
  deleteCategory,
  fetchAdminMenu,
  saveCategory,
  saveOrder,
  setCategoryActive,
} from "../../features/admin/api";
import { useLanguage } from "../../i18n/language";
import type { Category, CategoryDraft } from "../../types/menu";
import { errorText, localizedName, slugify } from "../../utils/format";

export function CategoriesPage() {
  const { lang, t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const menu = useQuery({ queryKey: ["admin-menu"], queryFn: fetchAdminMenu });
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [removing, setRemoving] = useState<Category | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const serverRows = menu.data ?? [];
  const rows =
    orderedIds
      ?.map((id) => serverRows.find((category) => category.id === id))
      .filter((category): category is Category => Boolean(category)) ?? serverRows;
  const displayRows = rows.length === serverRows.length ? rows : serverRows;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["admin-menu"] });
    await queryClient.invalidateQueries({ queryKey: ["public-menu"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-activity"] });
  }

  const orderMutation = useMutation({
    mutationFn: (ids: string[]) => saveOrder("categories", ids),
    onSuccess: invalidate,
    onError: (error) => {
      setOrderedIds(null);
      toast.push("error", errorText(error));
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, draft, slug, sortOrder }: { id: string | null; draft: CategoryDraft; slug: string; sortOrder: number }) =>
      saveCategory(id, draft, slug, sortOrder),
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
      toast.push("success", t.saved);
    },
    onError: (error) => toast.push("error", errorText(error)),
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => setCategoryActive(id, value),
    onSuccess: invalidate,
    onError: (error) => toast.push("error", errorText(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, target }: { id: string; target: string | null }) => deleteCategory(id, target),
    onSuccess: async () => {
      setRemoving(null);
      await invalidate();
      toast.push("success", t.deleted);
    },
    onError: (error) => toast.push("error", errorText(error)),
  });

  function persist(next: Category[]) {
    setOrderedIds(next.map((category) => category.id));
    orderMutation.mutate(next.map((category) => category.id));
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = displayRows.findIndex((category) => category.id === active.id);
    const newIndex = displayRows.findIndex((category) => category.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    persist(arrayMove(displayRows, oldIndex, newIndex));
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= displayRows.length) return;
    persist(arrayMove(displayRows, index, next));
  }

  const others = displayRows.filter((category) => category.id !== removing?.id);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-4xl text-wine">{t.categories}</h1>
        <button type="button" onClick={() => setEditing("new")} className="h-11 bg-burgundy px-4 text-sm text-ivory">
          {t.addCategory}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">{t.reorderHint}</p>
      {menu.isLoading ? <div className="mt-4 h-40 animate-pulse bg-burgundy/10" /> : null}
      {menu.isError ? <p className="mt-4 text-burgundy">{t.loadError}</p> : null}
      {!menu.isLoading && displayRows.length === 0 ? <p className="mt-6 text-muted">{t.noCategories}</p> : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={displayRows.map((category) => category.id)} strategy={verticalListSortingStrategy}>
          <ul className="mt-4 space-y-2">
            {displayRows.map((category, index) => (
              <CategoryRow
                key={category.id}
                category={category}
                lang={lang}
                label={localizedName(lang, category.name_ru, category.name_en)}
                activeLabel={category.is_active ? t.active : t.inactive}
                countLabel={`${category.menu_items.length} ${t.dishesCount}`}
                onToggle={() => activeMutation.mutate({ id: category.id, value: !category.is_active })}
                onEdit={() => setEditing(category)}
                onDelete={() => {
                  const fallback = displayRows.find((entry) => entry.id !== category.id);
                  setReassignTo(fallback?.id ?? "");
                  setRemoving(category);
                }}
                onUp={() => move(index, -1)}
                onDown={() => move(index, 1)}
                disableUp={index === 0}
                disableDown={index === displayRows.length - 1}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {editing ? (
        <CategoryDialog
          key={editing === "new" ? "new" : editing.id}
          category={editing === "new" ? null : editing}
          existingSlugs={displayRows.map((category) => category.slug)}
          nextOrder={displayRows.length}
          saving={saveMutation.isPending}
          onClose={() => setEditing(null)}
          onSave={(id, draft, slug, sortOrder) => saveMutation.mutate({ id, draft, slug, sortOrder })}
        />
      ) : null}

      <Dialog open={Boolean(removing)} title={t.confirmDeleteCategory} closeLabel={t.close} onClose={() => setRemoving(null)}>
        <p>{removing ? localizedName(lang, removing.name_ru, removing.name_en) : ""}</p>
        {removing && removing.menu_items.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm text-burgundy">{t.deleteBlocked}</p>
            {others.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t.noOtherCategory}</p>
            ) : (
              <label className="mt-3 block text-sm text-muted">
                {t.reassign}
                <select
                  value={reassignTo}
                  onChange={(event) => setReassignTo(event.target.value)}
                  className="mt-1 h-11 w-full border border-line bg-ivory px-3 text-base text-ink"
                >
                  {others.map((category) => (
                    <option key={category.id} value={category.id}>
                      {localizedName(lang, category.name_ru, category.name_en)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={deleteMutation.isPending || (Boolean(removing?.menu_items.length) && !reassignTo)}
            onClick={() =>
              removing &&
              deleteMutation.mutate({
                id: removing.id,
                target: removing.menu_items.length ? reassignTo : null,
              })
            }
            className="h-11 flex-1 bg-burgundy text-sm text-ivory disabled:opacity-60"
          >
            {removing?.menu_items.length ? t.moveAndDelete : t.delete}
          </button>
          <button type="button" onClick={() => setRemoving(null)} className="h-11 border border-line px-4 text-sm">
            {t.cancel}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function CategoryRow({
  category,
  label,
  activeLabel,
  countLabel,
  onToggle,
  onEdit,
  onDelete,
  onUp,
  onDown,
  disableUp,
  disableDown,
  lang,
}: {
  category: Category;
  lang: "ru" | "en";
  label: string;
  activeLabel: string;
  countLabel: string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUp: () => void;
  onDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
}) {
  const { t } = useLanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`border border-line bg-paper p-3 ${isDragging ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="grid h-11 w-11 shrink-0 place-items-center border border-line text-muted"
          aria-label={t.drag}
          {...attributes}
          {...listeners}
        >
          ≡
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted">
            {lang === "ru" ? category.name_en : category.name_ru} · {countLabel}
          </p>
        </div>
        <button type="button" onClick={onToggle} className="h-11 px-3 text-xs text-burgundy">
          {activeLabel}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className="h-11 border border-line px-3 text-sm">
          {t.editCategory}
        </button>
        <button type="button" onClick={onDelete} className="h-11 border border-burgundy px-3 text-sm text-burgundy">
          {t.delete}
        </button>
        <button type="button" onClick={onUp} disabled={disableUp} className="h-11 px-3 text-sm disabled:opacity-40">
          {t.moveUp}
        </button>
        <button type="button" onClick={onDown} disabled={disableDown} className="h-11 px-3 text-sm disabled:opacity-40">
          {t.moveDown}
        </button>
      </div>
    </li>
  );
}

function CategoryDialog({
  category,
  existingSlugs,
  nextOrder,
  saving,
  onClose,
  onSave,
}: {
  category: Category | null;
  existingSlugs: string[];
  nextOrder: number;
  saving: boolean;
  onClose: () => void;
  onSave: (id: string | null, draft: CategoryDraft, slug: string, sortOrder: number) => void;
}) {
  const { t } = useLanguage();
  const [nameRu, setNameRu] = useState(category?.name_ru ?? "");
  const [nameEn, setNameEn] = useState(category?.name_en ?? "");
  const [active, setActive] = useState(category?.is_active ?? true);
  const [error, setError] = useState("");

  function submit() {
    if (!nameRu.trim() || !nameEn.trim()) {
      setError(t.invalidNames);
      return;
    }
    let slug = category?.slug ?? slugify(nameEn);
    if (!category && existingSlugs.includes(slug)) {
      let suffix = 2;
      while (existingSlugs.includes(`${slug}-${suffix}`)) suffix += 1;
      slug = `${slug}-${suffix}`;
    }
    onSave(category?.id ?? null, { name_ru: nameRu, name_en: nameEn, is_active: active }, slug, category?.sort_order ?? nextOrder);
  }

  return (
    <Dialog open title={category ? t.editCategory : t.addCategory} closeLabel={t.close} onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm text-muted">
          {t.nameRu}
          <input value={nameRu} onChange={(event) => setNameRu(event.target.value)} className="mt-1 h-11 w-full border border-line bg-ivory px-3 text-base" />
        </label>
        <label className="block text-sm text-muted">
          {t.nameEn}
          <input value={nameEn} onChange={(event) => setNameEn(event.target.value)} className="mt-1 h-11 w-full border border-line bg-ivory px-3 text-base" />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          {t.active}
        </label>
        {error ? <p className="text-sm text-burgundy">{error}</p> : null}
        <div className="flex gap-2">
          <button type="button" disabled={saving} onClick={submit} className="h-11 flex-1 bg-burgundy text-sm text-ivory disabled:opacity-60">
            {saving ? t.saving : t.save}
          </button>
          <button type="button" onClick={onClose} className="h-11 border border-line px-4 text-sm">
            {t.cancel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
