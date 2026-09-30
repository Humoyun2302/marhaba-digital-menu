import { useQuery } from "@tanstack/react-query";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../features/admin/auth-context";
import { useLanguage } from "../../i18n/language";
import { supabase } from "../../lib/supabase";

const links = [
  { to: "/admin", end: true, key: "dashboard" },
  { to: "/admin/items", end: false, key: "dishes" },
  { to: "/admin/categories", end: false, key: "categories" },
  { to: "/admin/settings", end: false, key: "settings" },
] as const;

export function AdminLayout() {
  const { t } = useLanguage();
  const { session, ready } = useAuth();
  const membership = useQuery({
    queryKey: ["admin-membership", session?.user.id],
    enabled: Boolean(session?.user.id && supabase),
    queryFn: async () => {
      if (!supabase || !session) return false;
      const { data, error } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
  });

  if (!ready || (session && membership.isLoading)) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-muted" aria-live="polite">
        {t.loading}
      </div>
    );
  }
  if (!session) return <Navigate to="/admin/login" replace />;
  if (!membership.data) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="max-w-sm">
          <p className="text-burgundy">{membership.isError ? t.loadError : t.unauthorized}</p>
          <button type="button" className="mt-4 h-11 bg-burgundy px-5 text-sm text-ivory" onClick={() => void supabase?.auth.signOut()}>
            {t.logout}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ivory md:grid md:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r border-line bg-wine text-ivory md:flex md:flex-col">
        <div className="px-5 py-6">
          <p className="font-serif text-2xl tracking-[0.14em]">MARHABA</p>
          <p className="mt-1 text-xs tracking-[0.18em] text-gold-bright">{t.adminTitle}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex h-11 items-center px-3 text-sm ${isActive ? "bg-ivory text-wine" : "text-ivory/85 hover:bg-white/10"}`
              }
            >
              {t[link.key]}
            </NavLink>
          ))}
        </nav>
        <button type="button" onClick={() => void supabase?.auth.signOut()} className="m-3 h-11 border border-white/20 text-sm">
          {t.logout}
        </button>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between border-b border-line bg-paper px-4 py-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <p className="font-serif text-xl tracking-[0.12em] text-wine">MARHABA</p>
          <button type="button" onClick={() => void supabase?.auth.signOut()} className="h-11 px-3 text-sm text-burgundy">
            {t.logout}
          </button>
        </header>
        <div className="px-4 py-5 pb-28 md:px-8 md:py-8 md:pb-8">
          <Outlet />
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `flex h-14 items-center justify-center px-1 text-center text-[11px] leading-tight ${
                isActive ? "text-burgundy" : "text-muted"
              }`
            }
          >
            {t[link.key]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
