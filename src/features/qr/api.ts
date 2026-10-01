import { requireSupabase } from "../../lib/supabase";
import type { SiteSettings } from "../../types/menu";

export type QrInstallationStatus = "not_installed" | "installed" | "needs_inspection";

export type QrCard = {
  id: string;
  table_number: number;
  token: string;
  label: string | null;
  installation_status: QrInstallationStatus;
  internal_notes: string | null;
  created_at: string;
  scan_count: number;
  last_scanned_at: string | null;
};

export type QrOverview = {
  total: number;
  unique_tokens: number;
  unique_tables: number;
  installed: number;
  not_installed: number;
  needs_inspection: number;
  scans: number;
};

export type QrBoard = {
  ready: boolean;
  cards: QrCard[];
  overview: QrOverview | null;
  settings: Pick<SiteSettings, "id" | "qr_domain" | "qr_domain_locked"> | null;
};

function isMissingQrSchema(message: string): boolean {
  return /qr_admin|restaurant_qr_codes|schema cache|does not exist|PGRST202|PGRST205/i.test(message);
}

export async function fetchQrBoard(): Promise<QrBoard> {
  const client = requireSupabase();
  const [cardsResult, overviewResult, settingsResult] = await Promise.all([
    client.rpc("qr_admin_cards"),
    client.rpc("qr_admin_overview"),
    client.from("site_settings").select("id, qr_domain, qr_domain_locked").limit(1).maybeSingle(),
  ]);

  const schemaError = [cardsResult.error, overviewResult.error, settingsResult.error].find((error) => error && isMissingQrSchema(error.message));
  if (schemaError) return { ready: false, cards: [], overview: null, settings: null };
  if (cardsResult.error) throw new Error(cardsResult.error.message);
  if (overviewResult.error) throw new Error(overviewResult.error.message);

  let settings = settingsResult.data as QrBoard["settings"];
  if (settingsResult.error && /column/i.test(settingsResult.error.message)) {
    const fallback = await client.from("site_settings").select("id").limit(1).maybeSingle();
    if (fallback.error) throw new Error(fallback.error.message);
    settings = fallback.data ? { id: fallback.data.id, qr_domain: null, qr_domain_locked: false } : null;
  } else if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
  }

  return {
    ready: true,
    cards: ((cardsResult.data ?? []) as QrCard[]).map((card) => ({
      ...card,
      scan_count: Number(card.scan_count) || 0,
    })),
    overview: overviewResult.data as QrOverview,
    settings,
  };
}

export async function fetchRecentScans(id: string): Promise<string[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("qr_recent_scans", { p_id: id });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ scanned_at: string }>).map((row) => row.scanned_at);
}

export async function updateQrMeta(id: string, patch: {
  installation_status: QrInstallationStatus;
  label: string;
  internal_notes: string;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("restaurant_qr_codes")
    .update({
      installation_status: patch.installation_status,
      label: patch.label.trim() || null,
      internal_notes: patch.internal_notes.trim() || null,
    })
    .eq("id", id);
  if (error) {
    if (/permanent|cannot be deleted|locked/i.test(error.message)) throw new Error("QR_IMMUTABLE");
    throw new Error(error.message);
  }
}

export async function saveQrDomain(settingsId: string, domain: string, lock: boolean): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("site_settings")
    .update({ qr_domain: domain, qr_domain_locked: lock })
    .eq("id", settingsId);
  if (error) {
    if (/locked|column/i.test(error.message)) {
      throw new Error(/column/i.test(error.message) ? "MIGRATION_REQUIRED" : error.message);
    }
    throw new Error(error.message);
  }
}
