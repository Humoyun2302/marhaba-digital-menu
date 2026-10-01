import { ImagePlus, Plus, X } from "lucide-react";
import { useState } from "react";
import { Dialog } from "../../components/Dialog";
import { buttonClass, Button, DialogActions, Field, FormSection, Select, Switch, TextArea, TextInput } from "../../components/ui";
import { removeImage } from "../../features/admin/api";
import { uploadDishPhoto } from "../../features/admin/upload-photo";
import { bundledPhotos } from "../../features/menu/photos";
import { useLanguage } from "../../i18n/language";
import { supabase } from "../../lib/supabase";
import type { Category, ItemDraft, MenuItem } from "../../types/menu";
import { validateImageFile } from "../../utils/image";

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
  const { lang, t } = useLanguage();
  const [categoryId, setCategoryId] = useState(item?.category_id ?? categories[0]?.id ?? "");
  const [nameRu, setNameRu] = useState(item?.name_ru ?? "");
  const [nameEn, setNameEn] = useState(item?.name_en ?? "");
  const [descriptionRu, setDescriptionRu] = useState(item?.description_ru ?? "");
  const [descriptionEn, setDescriptionEn] = useState(item?.description_en ?? "");
  const [servingRu, setServingRu] = useState(item?.serving_ru ?? "");
  const [servingEn, setServingEn] = useState(item?.serving_en ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(item?.image_url ?? null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(item?.image_thumb_url ?? null);
  const [imageHidden, setImageHidden] = useState(item?.image_hidden ?? false);
  const [imageSource, setImageSource] = useState<string | null>(item?.image_source ?? null);
  const [imageLicense, setImageLicense] = useState<string | null>(item?.image_license ?? null);
  const [imageAttribution, setImageAttribution] = useState<string | null>(item?.image_attribution ?? null);
  const [imageReview, setImageReview] = useState(item?.image_review_status ?? null);
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
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error(t.unauthorized);
      const uploaded = await uploadDishPhoto(file, token, setProgress);
      if (imageUrl && imageUrl !== item?.image_url) await removeImage(imageUrl, "menu-images");
      if (thumbUrl && thumbUrl !== item?.image_thumb_url) await removeImage(thumbUrl, "menu-images");
      setImageUrl(uploaded.image_url);
      setThumbUrl(uploaded.image_thumb_url);
      setImageHidden(false);
      setImageSource(lang === "ru" ? "Загружено администратором" : "Uploaded by an administrator");
      setImageLicense("Restaurant");
      setImageAttribution(null);
      setImageReview("approved");
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
        image_thumb_url: thumbUrl,
        image_source: imageSource,
        image_license: imageLicense,
        image_attribution: imageAttribution,
        image_review_status: imageReview,
        image_hidden: imageHidden,
        serving_ru: servingRu,
        serving_en: servingEn,
        is_available: available,
        is_featured: featured,
        sort_order: order,
        options: parsed,
      });
      onClose();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : t.saveError;
      setError(message === "MIGRATION_REQUIRED" ? t.migrationRequired : message);
    } finally {
      setSaving(false);
    }
  }

  const bundled = item && !imageHidden ? bundledPhotos[item.id] : undefined;
  const preview = imageHidden ? null : imageUrl || bundled?.detail || null;
  const shownSource = imageSource || (!imageUrl && bundled ? bundled.attribution : null);
  const shownLicense = imageLicense || (!imageUrl && bundled ? bundled.license : null);

  return (
    <Dialog
      open
      wide
      title={item ? t.editDish : t.addDish}
      closeLabel={t.close}
      onClose={onClose}
      footer={
        <DialogActions>
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button className="w-full sm:w-auto" loading={saving} disabled={progress !== null} onClick={() => void submit()}>
            {saving ? t.saving : t.save}
          </Button>
        </DialogActions>
      }
    >
      <div className="space-y-4">
        <FormSection title={t.sectionBasics}>
          <Field label={t.category}>
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name_ru} / {category.name_en}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.nameRu}>
            <TextInput value={nameRu} onChange={(event) => setNameRu(event.target.value)} required />
          </Field>
          <Field label={t.nameEn}>
            <TextInput value={nameEn} onChange={(event) => setNameEn(event.target.value)} required />
          </Field>
          <Field label={t.descRu} hint={t.optional}>
            <TextArea value={descriptionRu} rows={3} onChange={(event) => setDescriptionRu(event.target.value)} />
          </Field>
          <Field label={t.descEn} hint={t.optional}>
            <TextArea value={descriptionEn} rows={3} onChange={(event) => setDescriptionEn(event.target.value)} />
          </Field>
          <Field label={t.servingRu} hint={t.optional}>
            <TextInput value={servingRu} onChange={(event) => setServingRu(event.target.value)} />
          </Field>
          <Field label={t.servingEn} hint={t.optional}>
            <TextInput value={servingEn} onChange={(event) => setServingEn(event.target.value)} />
          </Field>
        </FormSection>

        <FormSection title={t.sectionPhoto} hint={t.imageHint}>
          {preview ? (
            <img src={preview} alt="" className="aspect-[4/3] w-full max-w-xs rounded-[16px] object-cover" />
          ) : (
            <div className="grid h-28 place-items-center rounded-[16px] border border-dashed border-line bg-paper text-muted">
              <ImagePlus size={22} />
            </div>
          )}
          {shownSource || shownLicense ? (
            <p className="text-xs leading-relaxed text-muted">
              {shownSource ? `${t.imageAdminSource}: ${shownSource}` : null}
              {shownLicense ? ` · ${t.imageAdminLicense}: ${shownLicense}` : null}
            </p>
          ) : null}
          {imageReview === "needs_review" ? <p className="text-xs font-medium text-burgundy">{t.imageReview}</p> : null}
          <div className="flex flex-wrap gap-2">
            <label className={buttonClass("secondary", "sm", "cursor-pointer")}>
              {preview ? t.changeImage : t.upload}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => void onFile(event.target.files?.[0])}
              />
            </label>
            {preview ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (imageUrl) void removeImage(imageUrl, "menu-images");
                  if (thumbUrl) void removeImage(thumbUrl, "menu-images");
                  setImageUrl(null);
                  setThumbUrl(null);
                  setImageSource(null);
                  setImageLicense(null);
                  setImageAttribution(null);
                  setImageReview(null);
                  setImageHidden(true);
                }}
              >
                {t.removeImage}
              </Button>
            ) : null}
          </div>
          {progress !== null ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} role="progressbar">
              <div className="h-full rounded-full bg-burgundy" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          ) : null}
        </FormSection>

        <FormSection title={t.sectionVisibility}>
          <Switch checked={available} onChange={setAvailable} label={t.availability} />
          <Switch checked={featured} onChange={setFeatured} label={t.featuredLabel} />
          <Field label={t.sortOrder}>
            <TextInput inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
          </Field>
        </FormSection>

        <FormSection title={t.pricing}>
          <div className="space-y-3">
            {options.map((option, index) => (
              <div key={option.key} className="rounded-[16px] border border-line bg-paper p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <TextInput
                    aria-label={t.optionLabelRu}
                    placeholder={t.optionLabelRu}
                    value={option.label_ru}
                    onChange={(event) => updateOption(index, { label_ru: event.target.value })}
                  />
                  <TextInput
                    aria-label={t.optionLabelEn}
                    placeholder={t.optionLabelEn}
                    value={option.label_en}
                    onChange={(event) => updateOption(index, { label_en: event.target.value })}
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <TextInput
                    aria-label={t.price}
                    inputMode="numeric"
                    placeholder={t.price}
                    value={option.price}
                    onChange={(event) => updateOption(index, { price: event.target.value.replace(/[^\d]/g, "") })}
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={t.removeOption}
                    disabled={options.length === 1}
                    onClick={() => setOptions((current) => current.filter((entry) => entry.key !== option.key))}
                  >
                    <X size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOptions((current) => [...current, { key: crypto.randomUUID(), label_ru: "", label_en: "", price: "" }])}
          >
            <Plus size={16} />
            {t.addOption}
          </Button>
        </FormSection>
        {error ? <p className="text-sm text-burgundy">{error}</p> : null}
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
