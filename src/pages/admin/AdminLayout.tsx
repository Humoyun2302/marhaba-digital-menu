import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ClipboardList, Ellipsis, FolderTree, ImageIcon, LayoutDashboard, LayoutGrid, LogOut, QrCode, Settings, UtensilsCrossed } from "lucide-react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { MobileBottomNav } from "../../components/MobileBottomNav";
import { Button } from "../../components/ui";
import { useAuth } from "../../features/admin/auth-context";
import { useLanguage } from "../../i18n/language";
import { supabase } from "../../lib/supabase";

const links = [
  { to: "/admin", end: true, key: "dashboard", icon: LayoutDashboard },
  { to: "/admin/orders", end: false, key: "orders", icon: ClipboardList },
  { to: "/admin/tables", end: false, key: "tables", icon: LayoutGrid },
  { to: "/admin/items", end: false, key: "dishes", icon: UtensilsCrossed },
  { to: "/admin/categories", end: false, key: "categories", icon: FolderTree },
  { to: "/admin/qr", end: false, key: "qr", icon: QrCode },
  { to: "/admin/images", end: false, key: "images", icon: ImageIcon },
  { to: "/admin/settings", end: false, key: "settings", icon: Settings },
] as const;

const moreLinks = [
  { to: "/admin/tables", end: false, key: "tables", icon: LayoutGrid },
  { to: "/admin/qr", end: false, key: "qr", icon: QrCode },
  { to: "/admin/categories", end: false, key: "categories", icon: FolderTree },
  { to: "/admin/images", end: false, key: "images", icon: ImageIcon },
  { to: "/admin/settings", end: false, key: "settings", icon: Settings },
] as const;

export function AdminLayout() {
  const { t } = useLanguage();
  const location = useLocation();
  const [morePath, setMorePath] = useState<string | null>(null);
  const moreOpen = morePath === location.pathname;
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
        <div className="w-full max-w-sm rounded-[28px] border border-line bg-paper px-6 py-8 shadow-[var(--shadow-soft)]">
          <p className="text-burgundy">{membership.isError ? t.loadError : t.unauthorized}</p>
          <Button className="mt-5 w-full" onClick={() => void supabase?.auth.signOut()}>
            {t.logout}
          </Button>
        </div>
      </div>
    );
  }

  const moreActive = moreLinks.some((link) => (link.end ? location.pathname === link.to : location.pathname.startsWith(link.to)));
  const mobileItems = [
    { to: "/admin", end: true, label: t.dashboard, icon: LayoutDashboard },
    { to: "/admin/orders", end: false, label: t.orders, icon: ClipboardList },
    { to: "/admin/items", end: false, label: t.dishes, icon: UtensilsCrossed },
    {
      label: t.moreMenu,
      icon: Ellipsis,
      onClick: () => setMorePath((current) => (current === location.pathname ? null : location.pathname)),
      active: moreOpen || moreActive,
    },
  ];

  return (
    <div className="min-h-dvh bg-ivory md:grid md:grid-cols-[17rem_1fr]">
      <aside className="sticky top-3 m-3 hidden h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[28px] border border-line bg-paper p-4 shadow-[var(--shadow-soft)] md:flex">
        <div className="px-2 py-3">
          <p className="font-serif text-2xl tracking-[0.12em] text-ink">MARHABA</p>
          <p className="text-xs tracking-[0.16em] text-muted">HOTEL & SPA</p>
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex h-11 items-center gap-3 rounded-[14px] px-3 text-sm ${isActive ? "bg-burgundy/10 font-medium text-burgundy" : "text-muted hover:bg-ivory hover:text-ink"}`
              }
            >
              <link.icon size={18} />
              {t[link.key]}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 border-t border-line pt-3">
          <p className="truncate px-2 text-xs text-muted">{session.user.email}</p>
          <button
            type="button"
            onClick={() => void supabase?.auth.signOut()}
            className="mt-2 flex h-11 w-full items-center gap-2 rounded-[14px] px-3 text-sm text-burgundy hover:bg-burgundy/5"
          >
            <LogOut size={16} />
            {t.logout}
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between px-4 pt-[max(0.85rem,env(safe-area-inset-top))] pb-1 md:hidden">
          <p className="font-serif text-xl tracking-[0.14em] text-ink">MARHABA</p>
          <button type="button" onClick={() => void supabase?.auth.signOut()} className="h-11 rounded-[14px] px-3 text-sm text-burgundy">
            {t.logout}
          </button>
        </header>
        <div className="px-4 py-5 pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:px-8 md:py-8 md:pb-10">
          <Outlet />
        </div>
      </div>
      {moreOpen ? (
        <div className="md:hidden">
          <button type="button" aria-label={t.close} className="fixed inset-0 z-30 bg-wine/20" onClick={() => setMorePath(null)} />
          <div className="fixed inset-x-4 z-40 rounded-[24px] border border-line bg-paper p-2 shadow-[var(--shadow-soft)]" style={{ bottom: "calc(6.25rem + env(safe-area-inset-bottom))" }}>
            {moreLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMorePath(null)}
                className={({ isActive }) =>
                  `flex h-12 items-center gap-3 rounded-[16px] px-3 text-sm ${isActive ? "bg-burgundy/10 font-medium text-burgundy" : "text-ink"}`
                }
              >
                <link.icon size={18} />
                {t[link.key]}
              </NavLink>
            ))}
          </div>
        </div>
      ) : null}
      <MobileBottomNav items={mobileItems} label={t.adminTitle} />
    </div>
  );
}
