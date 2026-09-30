import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Logo } from "../../components/Logo";
import { useAuth } from "../../features/admin/auth-context";
import { useLanguage } from "../../i18n/language";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { errorText } from "../../utils/format";

export function AdminLoginPage() {
  const { t } = useLanguage();
  const { session, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const membership = useQuery({
    queryKey: ["admin-membership", session?.user.id],
    enabled: Boolean(session?.user.id && supabase),
    queryFn: async () => {
      const client = supabase;
      if (!client || !session) return false;
      const { data, error: membershipError } = await client
        .from("admin_users")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (membershipError) throw new Error(membershipError.message);
      return Boolean(data);
    },
  });

  if (ready && session && membership.data) return <Navigate to="/admin" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: adminEmail(email),
      password,
    });
    setSubmitting(false);
    if (signInError) {
      const message = errorText(signInError).toLowerCase();
      setError(message.includes("invalid") ? t.loginError : import.meta.env.DEV ? errorText(signInError) : t.loginError);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm border border-line bg-paper px-6 py-8">
        <div className="mb-6 flex justify-center">
          <Logo variant="header" />
        </div>
        <h1 className="text-center font-serif text-3xl text-wine">{t.loginTitle}</h1>
        {!isSupabaseConfigured ? <p className="mt-4 text-sm text-burgundy">{t.notConfigured}</p> : null}
        {ready && session && membership.isSuccess && !membership.data ? (
          <div className="mt-4 text-sm text-burgundy">
            <p>{t.unauthorized}</p>
            <button
              type="button"
              className="mt-3 h-11 w-full border border-burgundy text-burgundy"
              onClick={() => void supabase?.auth.signOut()}
            >
              {t.logout}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label={t.email} type="text" value={email} autoComplete="username" onChange={setEmail} />
            <Field label={t.password} type="password" value={password} autoComplete="current-password" onChange={setPassword} />
            {error ? <p className="text-sm text-burgundy">{error}</p> : null}
            <button
              type="submit"
              disabled={submitting || !isSupabaseConfigured}
              className="h-11 w-full bg-burgundy text-sm text-ivory disabled:opacity-60"
            >
              {submitting ? t.signingIn : t.signIn}
            </button>
          </form>
        )}
        <Link to="/" className="mt-6 block text-center text-sm text-muted">
          {t.backToMenu}
        </Link>
      </div>
    </div>
  );
}

function adminEmail(login: string): string {
  const value = login.trim().toLowerCase();
  if (value.includes("@")) return value;
  return "marhaba.admin@gmail.com";
}

function Field({
  label,
  type,
  value,
  autoComplete,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <label htmlFor={id} className="block text-sm text-muted">
      {label}
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        required
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full border border-line bg-ivory px-3 text-base text-ink"
      />
    </label>
  );
}
