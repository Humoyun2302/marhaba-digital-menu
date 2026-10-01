import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ToastContext, type ToastKind } from "./toast-context";

type ToastItem = { id: number; kind: ToastKind; message: string };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3600);
  }, []);

  const value = useMemo(() => ({ push }), [push]);
  const location = useLocation();
  const aboveNav = location.pathname.startsWith("/admin") && location.pathname !== "/admin/login";

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={`pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 ${
          aboveNav
            ? "bottom-[calc(6.75rem+env(safe-area-inset-bottom))] md:bottom-6"
            : "bottom-[max(1rem,env(safe-area-inset-bottom))]"
        }`}
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto w-full max-w-sm rounded-[18px] border px-4 py-3 text-sm shadow-[var(--shadow-soft)] ${
              toast.kind === "success"
                ? "border-line bg-paper text-ink"
                : "border-burgundy bg-wine text-ivory"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
