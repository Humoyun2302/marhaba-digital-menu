import { createContext, useContext } from "react";

export type ToastKind = "success" | "error";

export type ToastValue = {
  push: (kind: ToastKind, message: string) => void;
};

export const ToastContext = createContext<ToastValue | null>(null);

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("ToastProvider is missing");
  return value;
}
