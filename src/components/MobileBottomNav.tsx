import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";

type NavItem = {
  to?: string;
  end?: boolean;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  active?: boolean;
};

export function MobileBottomNav({ items, label }: { items: NavItem[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-4 z-40 md:hidden"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div
        className="grid rounded-[28px] border border-line bg-paper/95 p-1.5 shadow-[0_10px_30px_rgba(77,17,24,0.08)] backdrop-blur-md"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const className = (isActive: boolean) =>
            `flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] px-1 text-[10px] leading-none font-medium ${
              isActive ? "bg-burgundy/10 text-burgundy" : "text-muted"
            }`;
          if (!item.to) {
            return (
              <button key={item.label} type="button" onClick={item.onClick} className={className(Boolean(item.active))}>
                <item.icon size={18} />
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            );
          }
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => className(isActive)}>
              <item.icon size={18} />
              <span className="max-w-full truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
