import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "../../components/toast-context";
import { removeImage, saveSettings } from "../../features/admin/api";
import { fetchSettings } from "../../features/menu/api";
import { useLanguage } from "../../i18n/language";
import { supabase } from "../../lib/supabase";
import type { SettingsDraft } from "../../types/menu";
import { errorText, isHttpUrl } from "../../utils/format";
import { compressImage, uploadWithProgress, validateImageFile } from "../../utils/image";

export function SettingsPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  if (settings.isSuccess && !draft) {
    const current = settings.data;
    setDraft({
      restaurant_name: current?.restaurant_name ?? "MARHABA HOTEL & SPA",
      subtitle: current?.subtitle ?? "",
      logo_url: current?.logo_url ?? null,
      phone: current?.phone ?? "",
      address_ru: current?.address_ru ?? "",
      address_en: current?.address_en ?? "",
      instagram_url: current?.instagram_url ?? "",
      opening_hours_ru: current?.opening_hours_ru ?? "",
      opening_hours_en: current?.opening_hours_en ?? "",
    });
  }

  const saveMutation = useMutation({
    mutationFn: (next: SettingsDraft) => saveSettings(settings.data ?? null, next),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.push("success", t.saved);
    },
    onError: (saveError) => {
      setError(errorText(saveError));
      toast.push("error", t.saveError);
    },
  });

  async function onFile(file: File | undefined) {
    if (!file || !draft || !supabase) return;
    if (validateImageFile(file)) {
      setError(t.invalidImage);
      return;
    }
    setProgress(0.05);
    setError("");
    try {
      const prepared = await compressImage(file);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error(t.unauthorized);
      const url = await uploadWithProgress({
        bucket: "branding",
        path: `${crypto.randomUUID()}.${prepared.extension}`,
        blob: prepared.blob,
        contentType: prepared.contentType,
        accessToken: token,
        onProgress: setProgress,
      });
      if (draft.logo_url) await removeImage(draft.logo_url, "branding");
      setDraft({ ...draft, logo_url: url });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t.uploadError);
    } finally {
      setProgress(null);
    }
  }

  function submit() {
    if (!draft) return;
    if (draft.instagram_url.trim() && !isHttpUrl(draft.instagram_url.trim())) {
      setError(t.invalidUrl);
      return;
    }
    setError("");
    saveMutation.mutate(draft);
  }

  if (settings.isLoading || !draft) return <div className="h-40 animate-pulse bg-burgundy/10" />;
  if (settings.isError) return <p className="text-burgundy">{t.loadError}</p>;

  return (
    <div className="max-w-xl">
      <h1 className="font-serif text-4xl text-wine">{t.settings}</h1>
      <div className="mt-6 space-y-4">
        <Field label={t.restaurantName} value={draft.restaurant_name} onChange={(value) => setDraft({ ...draft, restaurant_name: value })} />
        <Field label={`${t.subtitle} (${t.optional})`} value={draft.subtitle} onChange={(value) => setDraft({ ...draft, subtitle: value })} />
        <div>
          <p className="text-sm text-muted">{t.logo}</p>
          {draft.logo_url ? <img src={draft.logo_url} alt="" className="mt-2 h-16 w-auto" /> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="inline-flex h-11 cursor-pointer items-center bg-wine px-4 text-sm text-ivory">
              {draft.logo_url ? t.changeImage : t.upload}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void onFile(event.target.files?.[0])} />
            </label>
            {draft.logo_url ? (
              <button
                type="button"
                className="h-11 border border-line px-4 text-sm"
                onClick={() => {
                  void removeImage(draft.logo_url, "branding");
                  setDraft({ ...draft, logo_url: null });
                }}
              >
                {t.removeImage}
              </button>
            ) : null}
          </div>
          {progress !== null ? (
            <div className="mt-2 h-1.5 bg-line" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-burgundy" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          ) : null}
        </div>
        <Field label={`${t.phone} (${t.optional})`} value={draft.phone} onChange={(value) => setDraft({ ...draft, phone: value })} />
        <Area label={`${t.addressRu} (${t.optional})`} value={draft.address_ru} onChange={(value) => setDraft({ ...draft, address_ru: value })} />
        <Area label={`${t.addressEn} (${t.optional})`} value={draft.address_en} onChange={(value) => setDraft({ ...draft, address_en: value })} />
        <Field label={`${t.instagram} (${t.optional})`} value={draft.instagram_url} onChange={(value) => setDraft({ ...draft, instagram_url: value })} />
        <Area label={`${t.hoursRu} (${t.optional})`} value={draft.opening_hours_ru} onChange={(value) => setDraft({ ...draft, opening_hours_ru: value })} />
        <Area label={`${t.hoursEn} (${t.optional})`} value={draft.opening_hours_en} onChange={(value) => setDraft({ ...draft, opening_hours_en: value })} />
        {error ? <p className="text-sm text-burgundy">{error}</p> : null}
        <button
          type="button"
          disabled={saveMutation.isPending || progress !== null}
          onClick={submit}
          className="h-11 bg-burgundy px-5 text-sm text-ivory disabled:opacity-60"
        >
          {saveMutation.isPending ? t.saving : t.save}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm text-muted">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full border border-line bg-paper px-3 text-base text-ink" />
    </label>
  );
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm text-muted">
      {label}
      <textarea value={value} rows={3} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full border border-line bg-paper px-3 py-2 text-base text-ink" />
    </label>
  );
}
