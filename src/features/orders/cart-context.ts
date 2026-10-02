import { createContext, useContext } from "react";
import type { CartLine } from "./policy";

export type CartValue = {
  lines: CartLine[];
  count: number;
  add: (line: CartLine) => void;
  setQuantity: (itemId: string, optionId: string, note: string, quantity: number) => void;
  setNote: (itemId: string, optionId: string, note: string, next: string) => void;
  remove: (itemId: string, optionId: string, note: string) => void;
  clear: () => void;
};

export const CartContext = createContext<CartValue | null>(null);

export function useCart(): CartValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("CartProvider is missing");
  return value;
}
