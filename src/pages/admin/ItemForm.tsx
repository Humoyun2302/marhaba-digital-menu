import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { removeImage } from "../../features/admin/api";
import { useLanguage } from "../../i18n/language";
import { supabase } from "../../lib/supabase";
import type { Category, ItemDraft, MenuItem } from "../../types/menu";
import { compressImage, uploadWithProgress, validateImageFile } from "../../utils/image";

type OptionDraft = {
  key: string;
  id?: string;
  label_ru: string;
  label_en: string;
  price: string;
};

type ItemFormProps = {
  categories: Category[];
  item: MenuItem | null;
  onClose: () => void;
  onSave: (id: string | null, draft: ItemDraft) => Promise<void>;
};

export function ItemForm({ categories, item, onClose, onSave }: ItemFormProps) {
  const { t } = useLanguage();
  const [categoryId, setCategoryId] = useState(item?.category_id ?? categories[0]?.id ?? "");
  const [nameRu, setNameRu] = useState(item?.name_ru ?? "");
  const [nameEn, setNameEn] = useState(item?.name_en ?? "");
  const [descriptionRu, setDescriptionRu] = useState(item?.description_ru ?? "");
  const [descriptionEn, setDescriptionEn] = useState(item?.description_en ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(item?.image_url ?? null);
  const [available, setAvailable] = useState(item?.is_available ?? true);
  const [featured, setFeatured] = useState(item?.is_featured ?? false);
  const [sortOrder, setSortOrder] = useState(String(item?.sort_order ?? nextSort(categories, item?.category_id ?? categories[0]?.id)));
  const [options, setOptions] = useState<OptionDraft[]>(
    item?.item_price_options.length
      ? item.item_price_options.map((option) => ({
          key: option.id,
          id: option.id,
          label_ru: option.label_ru ?? "",
          label_en: option.label_en ?? "",
          price: String(option.price),
        }))
      : [{ key: crypto.randomUUID(), label_ru: "", label_en: "", price: "" }],
  );
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file || !supabase) return;
    if (validateImageFile(file)) {
      setError(t.invalidImage);
      return;
    }
    setError("");
    setProgress(0.05);
    try {
      const prepared = await compressImage(file);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error(t.unauthorized);
      const path = `${crypto.randomUUID()}.${prepared.extension}`;
      const url = await uploadWithProgress({
        bucket: "menu-images",
        path,
        blob: prepared.blob,
        contentType: prepared.contentType,
        accessToken: token,
        onProgress: setProgress,
      });
      if (imageUrl && imageUrl !== item?.image_url) await removeImage(imageUrl, "menu-images");
      setImageUrl(url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t.uploadError);
    } finally {
      setProgress(null);
    }
  }

  async function submit() {
    if (!nameRu.trim() || !nameEn.trim()) {
      setError(t.invalidNames);
      return;
    }
    if (!categoryId) {
      setError(t.invalidCategory);
      return;
    }
    if (!options.length) {
      setError(t.needOption);
      return;
    }
    const parsed = options.map((option) => ({
      id: option.id,
      label_ru: option.label_ru,
      label_en: option.label_en,
      price: Number(option.price),
    }));
    if (parsed.some((option) => !Number.isInteger(option.price) || option.price < 0)) {
      setError(t.invalidPrice);
      return;
    }
    const order = Number(sortOrder);
    if (!Number.isInteger(order) || order < 0) {
      setError(t.invalidPrice);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(item?.id ?? null, {
        category_id: categoryId,
        name_ru: nameRu,
        name_en: nameEn,
        description_ru: descriptionRu,
        description_en: descriptionEn,
        image_url: imageUrl,
        is_available: available,
        is_featured: featured,
        sort_order: order,
        options: parsed,
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t.saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open title={item ? t.editDish : t.addDish} closeLabel={t.close} onClose={onClose} wide>
      <div className="space-y-4">
        <label className="block text-sm text-muted">
          {t.category}
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="mt-1 h-11 w-full border border-line bg-ivory px-3 text-base text-ink"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name_ru} / {category.name_en}
              </option>
            ))}
          </select>
        </label>
        <TextField label={t.nameRu} value={nameRu} onChange={setNameRu} required />
        <TextField label={t.nameEn} value={nameEn} onChange={setNameEn} required />
        <TextArea label={`${t.descRu} (${t.optional})`} value={descriptionRu} onChange={setDescriptionRu} />
        <TextArea label={`${t.descEn} (${t.optional})`} value={descriptionEn} onChange={setDescriptionEn} />
        <div>
          <p className="text-sm text-muted">{t.image}</p>
          {imageUrl ? <img src={imageUrl} alt="" className="mt-2 h-28 w-40 object-cover" /> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="inline-flex h-11 cursor-pointer items-center bg-wine px-4 text-sm text-ivory">
              {imageUrl ? t.changeImage : t.upload}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => void onFile(event.target.files?.[0])}
              />
            </label>
            {imageUrl ? (
              <button
                type="button"
                className="h-11 border border-line px-4 text-sm"
                onClick={() => {
                  void removeImage(imageUrl, "menu-images");
                  setImageUrl(null);
                }}
              >
                {t.removeImage}
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted">{t.imageHint}</p>
          {progress !== null ? (
            <div className="mt-2 h-1.5 bg-line" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} role="progressbar">
              <div className="h-full bg-burgundy" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          ) : null}
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} />
          {t.availability}
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} />
          {t.featuredLabel}
        </label>
        <TextField label={t.sortOrder} value={sortOrder} onChange={setSortOrder} inputMode="numeric" />
        <fieldset className="space-y-3 border border-line p-3">
          <legend className="px-1 text-sm text-muted">{t.pricing}</legend>
          {options.map((option, index) => (
            <div key={option.key} className="grid gap-2 sm:grid-cols-3">
              <input
                aria-label={t.optionLabelRu}
                placeholder={t.optionLabelRu}
                value={option.label_ru}
                onChange={(event) => updateOption(index, { label_ru: event.target.value })}
                className="h-11 border border-line bg-ivory px-3 text-base"
              />
              <input
                aria-label={t.optionLabelEn}
                placeholder={t.optionLabelEn}
                value={option.label_en}
                onChange={(event) => updateOption(index, { label_en: event.target.value })}
                className="h-11 border border-line bg-ivory px-3 text-base"
              />
              <div className="flex gap-2">
                <input
                  aria-label={t.price}
                  inputMode="numeric"
                  placeholder={t.price}
                  value={option.price}
                  onChange={(event) => updateOption(index, { price: event.target.value.replace(/[^\d]/g, "") })}
                  className="h-11 min-w-0 flex-1 border border-line bg-ivory px-3 text-base"
                />
                <button
                  type="button"
                  aria-label={t.removeOption}
                  disabled={options.length === 1}
                  onClick={() => setOptions((current) => current.filter((entry) => entry.key !== option.key))}
                  className="h-11 w-11 border border-line disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="h-11 px-2 text-sm text-burgundy"
            onClick={() =>
              setOptions((current) => [...current, { key: crypto.randomUUID(), label_ru: "", label_en: "", price: "" }])
            }
          >
            {t.addOption}
          </button>
        </fieldset>
        {error ? <p className="text-sm text-burgundy">{error}</p> : null}
        <div className="flex gap-2">
          <button type="button" disabled={saving || progress !== null} onClick={() => void submit()} className="h-11 flex-1 bg-burgundy text-sm text-ivory disabled:opacity-60">
            {saving ? t.saving : t.save}
          </button>
          <button type="button" onClick={onClose} className="h-11 border border-line px-4 text-sm">
            {t.cancel}
          </button>
        </div>
      </div>
    </Dialog>
  );

  function updateOption(index: number, patch: Partial<OptionDraft>) {
    setOptions((current) => current.map((option, optionIndex) => (optionIndex === index ? { ...option, ...patch } : option)));
  }
}

function nextSort(categories: Category[], categoryId: string | undefined): number {
  const category = categories.find((entry) => entry.id === categoryId);
  const max = category?.menu_items.reduce((highest, item) => Math.max(highest, item.sort_order), -1) ?? -1;
  return max + 1;
}

function TextField({
  label,
  value,
  onChange,
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="block text-sm text-muted">
      {label}
      <input
        required={required}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full border border-line bg-ivory px-3 text-base text-ink"
      />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm text-muted">
      {label}
      <textarea
        value={value}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full border border-line bg-ivory px-3 py-2 text-base text-ink"
      />
    </label>
  );
}
