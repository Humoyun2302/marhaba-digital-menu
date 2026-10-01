import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/toast-context";
import { AdminPageHeader, Button, DialogActions, EmptyState, Field, SearchField, Select, TextArea, TextInput } from "../../components/ui";
import { fetchQrBoard, fetchRecentScans, saveQrDomain, updateQrMeta, type QrCard, type QrInstallationStatus } from "../../features/qr/api";
import { buildQrPdf, buildQrZip, createQrDataUrl, downloadBlob, downloadText, QR_RANGES, renderQrCardPng, renderQrSvg } from "../../features/qr/print";
import { canLockQrDomain, formatTableNumber, normalizeQrDomain, tableMenuUrl } from "../../features/qr/url";
import { useLanguage } from "../../i18n/language";
import { errorText } from "../../utils/format";

export function QrPage() {
  const { lang, t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const board = useQuery({ queryKey: ["qr-board"], queryFn: fetchQrBoard });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("number");
  const [range, setRange] = useState("all");
  const [domainDraft, setDomainDraft] = useState<string | null>(null);
  const [lockDraft, setLockDraft] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<QrCard | null>(null);
  const [busy, setBusy] = useState(false);

  const settings = board.data?.settings;
  const domain = domainDraft ?? settings?.qr_domain ?? "";
  const lock = lockDraft ?? Boolean(settings?.qr_domain_locked);
  const locked = Boolean(settings?.qr_domain_locked && settings.qr_domain);
  const origin = settings?.qr_domain || (typeof window === "undefined" ? "" : window.location.origin);
  const printReady = locked;

  const cards = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const rows = (board.data?.cards ?? []).filter((card) => {
      if (status !== "all" && card.installation_status !== status) return false;
      if (!needle) return true;
      const padded = formatTableNumber(card.table_number);
      return padded.includes(needle) || String(card.table_number).includes(needle) || (card.label ?? "").toLocaleLowerCase().includes(needle);
    });
    return rows.sort((a, b) => (sort === "scans" ? b.scan_count - a.scan_count || a.table_number - b.table_number : a.table_number - b.table_number));
  }, [board.data?.cards, search, sort, status]);

  const domainMutation = useMutation({
    mutationFn: async () => {
      if (!settings) throw new Error(t.qrSetupText);
      const normalized = normalizeQrDomain(domain);
      if (!normalized) throw new Error(t.invalidUrl);
      const shouldLock = lock || locked;
      if (shouldLock && !locked && !canLockQrDomain(normalized)) throw new Error(t.invalidUrl);
      if (shouldLock && !locked && !window.confirm(t.qrLockConfirm)) throw new Error("CANCELLED");
      await saveQrDomain(settings.id, normalized, shouldLock);
    },
    onSuccess: async () => {
      setDomainDraft(null);
      setLockDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["qr-board"] });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.push("success", t.saved);
    },
    onError: (error) => {
      if (error instanceof Error && error.message === "CANCELLED") return;
      toast.push("error", error instanceof Error && error.message === "MIGRATION_REQUIRED" ? t.migrationRequired : errorText(error));
    },
  });

  function cardCopy(card: QrCard) {
    return {
      url: tableMenuUrl(origin, card.token),
      tableLabel: `${t.qrTable.toLocaleUpperCase(lang === "ru" ? "ru" : "en")} №${formatTableNumber(card.table_number)}`,
      brand: t.qrBrand,
      caption: t.qrScanCta,
      notForPrint: printReady ? null : t.qrNotForPrint,
    };
  }

  function allowPrint(): boolean {
    return printReady || window.confirm(t.qrDomainWarning);
  }

  async function downloadPng(card: QrCard) {
    if (!allowPrint()) return;
    setBusy(true);
    try {
      const blob = await renderQrCardPng(cardCopy(card));
      downloadBlob(blob, `marhaba-table-${formatTableNumber(card.table_number)}.png`);
    } catch (error) {
      toast.push("error", errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function downloadSvg(card: QrCard) {
    if (!allowPrint()) return;
    setBusy(true);
    try {
      const svg = await renderQrSvg(cardCopy(card));
      downloadText(svg, `marhaba-table-${formatTableNumber(card.table_number)}.svg`, "image/svg+xml");
    } catch (error) {
      toast.push("error", errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function downloadArchive(kind: "zip" | "pdf") {
    if (!allowPrint()) return;
    const bounds = QR_RANGES.find((entry) => entry.id === range) ?? QR_RANGES[0];
    const chosen = (board.data?.cards ?? []).filter((card) => card.table_number >= bounds.from && card.table_number <= bounds.to);
    if (!chosen.length) return;
    setBusy(true);
    try {
      const files = [];
      for (const card of chosen) {
        files.push({ name: `marhaba-table-${formatTableNumber(card.table_number)}.png`, blob: await renderQrCardPng(cardCopy(card)) });
      }
      if (kind === "zip") {
        downloadBlob(await buildQrZip(files), `marhaba-qr-${bounds.id}.zip`);
      } else {
        downloadBlob(await buildQrPdf(files.map((file) => file.blob)), `marhaba-qr-${bounds.id}.pdf`);
      }
    } catch (error) {
      toast.push("error", errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(card: QrCard) {
    const url = tableMenuUrl(origin, card.token);
    try {
      await navigator.clipboard.writeText(url);
      toast.push("success", printReady ? t.qrCopied : t.qrCopiedWarn);
    } catch {
      toast.push("error", t.saveError);
    }
  }

  if (board.isLoading) return <div className="h-40 animate-pulse rounded-[24px] bg-paper" />;
  if (board.isError) {
    return (
      <EmptyState title={t.loadError} text={errorText(board.error)} action={<Button onClick={() => void board.refetch()}>{t.retry}</Button>} />
    );
  }
  if (!board.data?.ready) {
    return (
      <div>
        <AdminPageHeader title={t.qrTitle} description={t.qrSubtitle} />
        <div className="mt-6">
          <EmptyState title={t.qrSetupTitle} text={t.qrSetupText} />
        </div>
      </div>
    );
  }

  const overview = board.data.overview;
  const healthy = Boolean(overview && overview.total === 120 && overview.unique_tokens === 120 && overview.unique_tables === 120);

  return (
    <div>
      <AdminPageHeader title={t.qrTitle} description={t.qrSubtitle} />
      {!printReady ? (
        <p className="mt-4 rounded-[18px] border border-burgundy/20 bg-burgundy/8 px-4 py-3 text-sm leading-relaxed text-burgundy">{t.qrDomainWarning}</p>
      ) : (
        <p className="mt-4 rounded-[18px] border border-line bg-paper px-4 py-3 text-sm leading-relaxed text-muted">{t.qrDomainLocked}</p>
      )}
      <p className={`mt-3 text-sm ${healthy ? "text-muted" : "text-burgundy"}`}>{healthy ? t.qrIntegrityOk : t.qrIntegrityBad}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t.qrTotal} value={overview?.total ?? 0} />
        <Stat label={t.qrInstalled} value={overview?.installed ?? 0} />
        <Stat label={t.qrNotInstalled} value={overview?.not_installed ?? 0} />
        <Stat label={t.qrScans} value={overview?.scans ?? 0} />
      </div>
      {overview && overview.needs_inspection > 0 ? (
        <p className="mt-3 text-sm text-muted">{t.qrInspectionNote}: {overview.needs_inspection}</p>
      ) : null}

      <section className="mt-4 rounded-[24px] border border-line bg-paper p-4 shadow-[var(--shadow-soft)] sm:p-5">
        <h2 className="font-serif text-2xl text-ink">{t.qrDomain}</h2>
        <p className="mt-1 text-sm text-muted">{t.qrDomainHint}</p>
        {locked ? (
          <p className="mt-4 break-all font-medium text-ink">{settings?.qr_domain}</p>
        ) : (
          <div className="mt-4 space-y-3">
            <TextInput value={domain} placeholder="https://" onChange={(event) => setDomainDraft(event.target.value)} />
            <label className="flex items-start gap-3 text-sm text-ink">
              <input type="checkbox" className="mt-1" checked={lock} onChange={(event) => setLockDraft(event.target.checked)} />
              <span>{t.qrLockLabel}</span>
            </label>
            <Button loading={domainMutation.isPending} onClick={() => domainMutation.mutate()}>
              {t.qrSaveDomain}
            </Button>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-[24px] border border-line bg-paper p-4 shadow-[var(--shadow-soft)] sm:p-5">
        <h2 className="font-serif text-2xl text-ink">{t.qrPrint}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto_auto] sm:items-end">
          <Field label={t.qrRange}>
            <Select value={range} onChange={(event) => setRange(event.target.value)}>
              <option value="all">{t.qrRangeAll}</option>
              <option value="001-030">001–030</option>
              <option value="031-060">031–060</option>
              <option value="061-090">061–090</option>
              <option value="091-120">091–120</option>
            </Select>
          </Field>
          <Button disabled={busy} onClick={() => void downloadArchive("pdf")}>{busy ? t.qrPreparing : t.qrPdf}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void downloadArchive("zip")}>{t.qrZip}</Button>
        </div>
      </section>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
        <SearchField value={search} onChange={setSearch} placeholder={t.qrSearch} label={t.qrSearch} clearLabel={t.clearSearch} onClear={() => setSearch("")} />
        <Select aria-label={t.qrFilter} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">{t.qrAllStatuses}</option>
          <option value="installed">{t.qrStatusInstalled}</option>
          <option value="not_installed">{t.qrStatusNot}</option>
          <option value="needs_inspection">{t.qrStatusInspect}</option>
        </Select>
        <Select aria-label={t.qrSort} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="number">{t.qrSortNumber}</option>
          <option value="scans">{t.qrSortScans}</option>
        </Select>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article key={card.id} className="rounded-[22px] border border-line bg-paper p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">{t.qrTable}</p>
                <h2 className="font-serif text-4xl leading-none text-ink">№{formatTableNumber(card.table_number)}</h2>
              </div>
              <StatusBadge status={card.installation_status} labels={statusLabels(t)} />
            </div>
            {card.label ? <p className="mt-2 text-sm text-muted">{card.label}</p> : null}
            <QrThumb url={tableMenuUrl(origin, card.token)} />
            <p className="mt-3 text-sm text-ink">{t.qrScanCount}: {card.scan_count}</p>
            <p className="text-xs text-muted">
              {t.qrLastScan}: {card.last_scanned_at ? formatWhen(card.last_scanned_at, lang) : t.qrNever}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void downloadPng(card)}>{t.qrDownload}</Button>
              <Button size="sm" variant="secondary" onClick={() => void copyLink(card)}>{t.qrCopyLink}</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(card)}>{t.qrOpen}</Button>
            </div>
          </article>
        ))}
      </div>

      <QrDetail
        key={selected?.id ?? "closed"}
        card={selected}
        origin={origin}
        printReady={printReady}
        busy={busy}
        onClose={() => setSelected(null)}
        onCopy={() => selected && void copyLink(selected)}
        onPng={() => selected && void downloadPng(selected)}
        onSvg={() => selected && void downloadSvg(selected)}
      />
    </div>
  );
}

function QrDetail({
  card,
  origin,
  printReady,
  busy,
  onClose,
  onCopy,
  onPng,
  onSvg,
}: {
  card: QrCard | null;
  origin: string;
  printReady: boolean;
  busy: boolean;
  onClose: () => void;
  onCopy: () => void;
  onPng: () => void;
  onSvg: () => void;
}) {
  const { lang, t } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<QrInstallationStatus>(card?.installation_status ?? "not_installed");
  const [label, setLabel] = useState(card?.label ?? "");
  const [notes, setNotes] = useState(card?.internal_notes ?? "");
  const [qr, setQr] = useState<string | null>(null);
  const scans = useQuery({
    queryKey: ["qr-scans", card?.id],
    enabled: Boolean(card),
    queryFn: () => fetchRecentScans(card?.id ?? ""),
  });

  useEffect(() => {
    if (!card) return;
    let cancelled = false;
    void createQrDataUrl(tableMenuUrl(origin, card.token), 640).then((value) => {
      if (!cancelled) setQr(value);
    });
    return () => {
      cancelled = true;
    };
  }, [card, origin]);

  const save = useMutation({
    mutationFn: () => {
      if (!card) throw new Error(t.saveError);
      return updateQrMeta(card.id, { installation_status: status, label, internal_notes: notes });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["qr-board"] });
      toast.push("success", t.saved);
      onClose();
    },
    onError: (error) => {
      toast.push("error", error instanceof Error && error.message === "QR_IMMUTABLE" ? t.qrImmutableError : errorText(error));
    },
  });

  const url = card ? tableMenuUrl(origin, card.token) : "";

  return (
    <Dialog open={Boolean(card)} wide title={card ? `${t.qrTable} №${formatTableNumber(card.table_number)}` : t.qrTitle} closeLabel={t.close} onClose={onClose}>
      {card ? (
        <div className="space-y-4">
          <div className="mx-auto w-full max-w-xs rounded-[20px] bg-white p-3">
            {qr ? <img src={qr} alt="" className="aspect-square w-full" /> : <div className="aspect-square animate-pulse rounded-[12px] bg-ivory" />}
          </div>
          <p className="text-sm leading-relaxed text-muted">{t.qrPermanent}</p>
          <Field label={t.qrCopyLink}>
            <TextInput readOnly value={url} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={onPng}>{t.qrPng}</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={onSvg}>{t.qrSvg}</Button>
            <Button size="sm" variant="ghost" onClick={onCopy}>{t.qrCopyLink}</Button>
          </div>
          {!printReady ? <p className="text-sm text-burgundy">{t.qrNotForPrint}</p> : null}
          <Field label={t.qrFilter}>
            <Select value={status} onChange={(event) => setStatus(event.target.value as QrInstallationStatus)}>
              <option value="not_installed">{t.qrStatusNot}</option>
              <option value="installed">{t.qrStatusInstalled}</option>
              <option value="needs_inspection">{t.qrStatusInspect}</option>
            </Select>
          </Field>
          <Field label={t.qrLabel} hint={t.optional}>
            <TextInput value={label} onChange={(event) => setLabel(event.target.value)} />
          </Field>
          <Field label={t.qrNotes} hint={t.optional}>
            <TextArea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          <p className="text-sm text-ink">{t.qrScanCount}: {card.scan_count}</p>
          <p className="text-sm text-muted">{t.qrLastScan}: {card.last_scanned_at ? formatWhen(card.last_scanned_at, lang) : t.qrNever}</p>
          <div>
            <p className="text-sm font-medium text-ink">{t.qrHistory}</p>
            {scans.data && scans.data.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {scans.data.map((stamp) => (
                  <li key={stamp}>{formatWhen(stamp, lang)}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">{t.qrNever}</p>
            )}
          </div>
          <DialogActions>
            <Button loading={save.isPending} onClick={() => save.mutate()}>{t.qrSaveMeta}</Button>
          </DialogActions>
        </div>
      ) : null}
    </Dialog>
  );
}

function QrThumb({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!node) return;
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void createQrDataUrl(url, 280).then((value) => {
        if (!cancelled) setSrc(value);
      });
    }, { rootMargin: "240px" });
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [node, url]);

  return (
    <div ref={setNode} className="mx-auto mt-3 grid aspect-square w-full max-w-[220px] place-items-center rounded-[18px] border border-line bg-white p-2">
      {src ? <img src={src} alt="" className="h-full w-full" /> : <div className="h-full w-full animate-pulse rounded-[12px] bg-ivory" />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-line bg-paper p-4 shadow-[var(--shadow-soft)]">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{label}</p>
      <p className="mt-2 font-serif text-4xl leading-none text-ink">{value}</p>
    </div>
  );
}

function StatusBadge({ status, labels }: { status: QrInstallationStatus; labels: Record<QrInstallationStatus, string> }) {
  const tone = status === "installed" ? "bg-burgundy/10 text-burgundy" : status === "needs_inspection" ? "bg-[#f3e4c4] text-wine" : "bg-[#efe8dc] text-muted";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{labels[status]}</span>;
}

function statusLabels(t: { qrStatusInstalled: string; qrStatusNot: string; qrStatusInspect: string }): Record<QrInstallationStatus, string> {
  return {
    installed: t.qrStatusInstalled,
    not_installed: t.qrStatusNot,
    needs_inspection: t.qrStatusInspect,
  };
}

function formatWhen(value: string, lang: "ru" | "en"): string {
  return new Date(value).toLocaleString(lang === "ru" ? "ru-RU" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}
