import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "../../features/admin/AuthProvider";
import { NotFoundPage } from "../NotFoundPage";
import { AdminLayout } from "./AdminLayout";
import { AdminLoginPage } from "./AdminLoginPage";
import { CategoriesPage } from "./CategoriesPage";
import { DashboardPage } from "./DashboardPage";
import { ImagesPage } from "./ImagesPage";
import { ItemsPage } from "./ItemsPage";
import { QrPage } from "./QrPage";
import { SettingsPage } from "./SettingsPage";

export default function AdminApp() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    const previous = document.title;
    document.title = "Admin — MARHABA Hotel & Spa";
    return () => {
      meta.remove();
      document.title = previous;
    };
  }, []);

  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<AdminLoginPage />} />
        <Route element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="qr" element={<QrPage />} />
          <Route path="images" element={<ImagesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
