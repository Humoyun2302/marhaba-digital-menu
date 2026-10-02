import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CartContext, type CartValue } from "./cart-context";
import { addCartLine, type CartLine } from "./policy";
import { cartStorageKey, readScopedCart, writeScopedCart } from "./storage";
import { useVisit } from "./visit-context";

export function CartProvider({ children }: { children: ReactNode }) {
  const { visit } = useVisit();
  const scope = visit ? cartStorageKey(visit.token, visit.sessionId) : "";
  const [scopeKey, setScopeKey] = useState(scope);
  const [lines, setLines] = useState<CartLine[]>(() => (
    visit ? readScopedCart(visit.token, visit.sessionId) : []
  ));

  if (scope !== scopeKey) {
    setScopeKey(scope);
    setLines(visit ? readScopedCart(visit.token, visit.sessionId) : []);
  }

  useEffect(() => {
    if (!visit || scope !== scopeKey) return;
    writeScopedCart(visit.token, visit.sessionId, lines);
  }, [lines, scope, scopeKey, visit]);

  const value = useMemo<CartValue>(() => ({
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    add: (line) => setLines((current) => addCartLine(current, line)),
    setQuantity: (itemId, optionId, note, quantity) => setLines((current) => (
      quantity <= 0
        ? current.filter((line) => !(line.itemId === itemId && line.optionId === optionId && line.note === note))
        : current.map((line) => (
          line.itemId === itemId && line.optionId === optionId && line.note === note
            ? { ...line, quantity: Math.min(20, Math.trunc(quantity)) }
            : line
        ))
    )),
    setNote: (itemId, optionId, note, next) => setLines((current) => current.map((line) => (
      line.itemId === itemId && line.optionId === optionId && line.note === note
        ? { ...line, note: next.trim().slice(0, 200) }
        : line
    ))),
    remove: (itemId, optionId, note) => setLines((current) => current.filter((line) => !(
      line.itemId === itemId && line.optionId === optionId && line.note === note
    ))),
    clear: () => setLines([]),
  }), [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
