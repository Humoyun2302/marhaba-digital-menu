import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui";
import { isLikelyBot } from "../features/qr/url";
import { useLanguage } from "../i18n/language";
import { supabase } from "../lib/supabase";

export function TableLinkPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [invalid, setInvalid] = useState(false);

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
      navigate("/", { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, token]);

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
