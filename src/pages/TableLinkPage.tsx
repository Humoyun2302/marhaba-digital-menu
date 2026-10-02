import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui";
import { openGuestVisit, OrderError } from "../features/orders/api";
import { clearScopedCart, previousSessionId } from "../features/orders/storage";
import { useVisit } from "../features/orders/visit-context";
import { isLikelyBot } from "../features/qr/url";
import { useLanguage } from "../i18n/language";
import { supabase } from "../lib/supabase";

export function TableLinkPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [invalid, setInvalid] = useState(false);
  const [failed, setFailed] = useState(false);
  const { adopt } = useVisit();

  useEffect(() => {
    let cancelled = false;
    const stampKey = `marhaba-qr-stamp:${token}`;
    let record = !isLikelyBot();
    try {
      const last = Number(sessionStorage.getItem(stampKey) || 0);
      if (Date.now() - last < 5000) record = false;
      else sessionStorage.setItem(stampKey, String(Date.now()));
    } catch {
      record = !isLikelyBot();
    }

    void (async () => {
      if (!token || !supabase) {
        navigate("/", { replace: true });
        return;
      }
      const { data, error } = await supabase.rpc("record_qr_scan", { p_token: token, p_record: record });
      if (cancelled) return;
      if (error || data == null) {
        if (error) {
          navigate("/", { replace: true });
          return;
        }
        setInvalid(true);
        return;
      }
      try {
        const prior = previousSessionId(token);
        const opened = await openGuestVisit(token);
        if (cancelled) return;
        if (!opened.resumed && prior && prior !== opened.sessionId) clearScopedCart(token, prior);
        adopt({
          token,
          tableNumber: opened.tableNumber,
          sessionId: opened.sessionId,
          secret: opened.secret,
          resumed: opened.resumed,
          boundAt: Date.now(),
        });
        navigate("/", { replace: true });
      } catch (reason) {
        if (cancelled) return;
        if (reason instanceof OrderError && reason.code === "INVALID_TABLE") setInvalid(true);
        else setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adopt, navigate, token]);

  if (failed) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="w-full max-w-md rounded-[28px] border border-line bg-paper px-6 py-8 shadow-[var(--shadow-soft)]">
          <p className="font-serif text-3xl text-ink">{t.loadError}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">{t.orderingSetup}</p>
          <Link to="/" className="mt-6 inline-flex">
            <Button>{t.backToMenu}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!invalid) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-8 w-8 animate-pulse rounded-full border border-burgundy" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="w-full max-w-md rounded-[28px] border border-line bg-paper px-6 py-8 shadow-[var(--shadow-soft)]">
        <p className="font-serif text-3xl text-ink">{t.qrInvalidTitle}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">{t.qrInvalidText}</p>
        <Link to="/" className="mt-6 inline-flex">
          <Button>{t.backToMenu}</Button>
        </Link>
      </div>
    </div>
  );
}
