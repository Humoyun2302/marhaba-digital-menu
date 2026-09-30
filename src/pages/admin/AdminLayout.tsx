import { useQuery } from "@tanstack/react-query";
import { FolderTree, LayoutDashboard, LogOut, Settings, UtensilsCrossed } from "lucide-react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../features/admin/auth-context";
import { useLanguage } from "../../i18n/language";
import { supabase } from "../../lib/supabase";

const links = [
  { to: "/admin", end: true, key: "dashboard", icon: LayoutDashboard },
  { to: "/admin/items", end: false, key: "dishes", icon: UtensilsCrossed },
  { to: "/admin/categories", end: false, key: "categories", icon: FolderTree },
  { to: "/admin/settings", end: false, key: "settings", icon: Settings },
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
    <div className="min-h-dvh bg-ivory md:grid md:grid-cols-[16rem_1fr]">
      <aside className="m-3 hidden flex-col rounded-xl border border-line bg-paper p-4 shadow-[var(--shadow-soft)] md:flex">
        <div className="px-2 py-3">
          <p className="font-serif text-2xl tracking-[0.12em] text-ink">MARHABA</p>
          <p className="text-xs tracking-[0.16em] text-muted">HOTEL & SPA</p>
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex h-11 items-center gap-3 rounded-md px-3 text-sm ${isActive ? "bg-burgundy/10 font-medium text-burgundy" : "text-muted hover:bg-ivory hover:text-ink"}`
              }
            >
              <link.icon size={18} />
              {t[link.key]}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-line pt-3">
          <p className="truncate px-2 text-xs text-muted">{session.user.email}</p>
          <button type="button" onClick={() => void supabase?.auth.signOut()} className="mt-2 flex h-11 w-full items-center gap-2 rounded-md px-3 text-sm text-burgundy hover:bg-burgundy/5">
            <LogOut size={16} />
            {t.logout}
          </button>
        </div>
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
      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-xl border border-line bg-paper p-1 shadow-[var(--shadow-soft)] md:hidden">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `flex h-14 flex-col items-center justify-center gap-1 rounded-md text-[11px] ${isActive ? "bg-burgundy/10 text-burgundy" : "text-muted"}`
            }
          >
            <link.icon size={18} />
            {t[link.key]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
