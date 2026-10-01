import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Logo } from "../../components/Logo";
import { Button, Field, TextInput } from "../../components/ui";
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
      <div className="w-full max-w-sm rounded-[28px] border border-line bg-paper px-6 py-8 shadow-[var(--shadow-soft)]">
        <div className="mb-6 flex justify-center">
          <Logo variant="header" />
        </div>
        <h1 className="text-center font-serif text-3xl leading-tight text-ink">{t.loginTitle}</h1>
        {!isSupabaseConfigured ? <p className="mt-4 text-sm text-burgundy">{t.notConfigured}</p> : null}
        {ready && session && membership.isSuccess && !membership.data ? (
          <div className="mt-5 text-sm text-burgundy">
            <p>{t.unauthorized}</p>
            <Button variant="secondary" className="mt-4 w-full" onClick={() => void supabase?.auth.signOut()}>
              {t.logout}
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label={t.email}>
              <TextInput type="text" value={email} autoComplete="username" required onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label={t.password}>
              <TextInput
                type="password"
                value={password}
                autoComplete="current-password"
                required
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            {error ? <p className="text-sm text-burgundy">{error}</p> : null}
            <Button type="submit" className="w-full" loading={submitting} disabled={!isSupabaseConfigured}>
              {submitting ? t.signingIn : t.signIn}
            </Button>
          </form>
        )}
        <Link to="/" className="mt-6 block text-center text-sm text-muted hover:text-ink">
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
