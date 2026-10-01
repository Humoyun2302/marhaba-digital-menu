import { Component, lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { useLanguage } from "./i18n/language";
import { MenuPage } from "./pages/MenuPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { TableLinkPage } from "./pages/TableLinkPage";

const AdminApp = lazy(() => import("./pages/admin/AdminApp"));

export default function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route path="/" element={<MenuPage />} />
        <Route path="/t/:token" element={<TableLinkPage />} />
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppErrorBoundary>
  );
}

function RouteFallback() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="h-8 w-8 animate-pulse rounded-full border border-burgundy" aria-hidden="true" />
    </div>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <BoundaryFallback />;
    return this.props.children;
  }
}

function BoundaryFallback() {
  const { t } = useLanguage();
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="font-serif text-3xl text-ink">{t.loadError}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 inline-flex h-12 items-center rounded-[16px] bg-burgundy px-5 text-sm font-medium text-ivory">
          {t.retry}
        </button>
      </div>
    </div>
  );
}
