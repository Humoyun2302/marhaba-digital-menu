import assert from "node:assert/strict";
import {
  cartStorageKey,
  clearScopedCart,
  discardLegacyCart,
  readScopedCart,
  writeScopedCart,
} from "../src/features/orders/storage.ts";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const local = new MemoryStorage();
const session = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: local, configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: session, configurable: true });

const line = { itemId: "plov", optionId: "opt", quantity: 2, note: "" };
local.setItem("marhaba.cart.v1", JSON.stringify([line, line, line]));
discardLegacyCart();
assert.equal(local.getItem("marhaba.cart.v1"), null);

const table9 = "9".repeat(40);
const table10 = "a".repeat(40);
writeScopedCart(table9, "guest-a", [line]);
writeScopedCart(table10, "guest-b", [{ ...line, itemId: "salad", quantity: 1 }]);
assert.notEqual(cartStorageKey(table9, "guest-a"), cartStorageKey(table10, "guest-b"));
assert.equal(readScopedCart(table9, "guest-a")[0]?.itemId, "plov");
assert.equal(readScopedCart(table10, "guest-b")[0]?.itemId, "salad");
assert.equal(readScopedCart(table9, "guest-b").length, 0);
assert.equal(readScopedCart(table10, "guest-a").length, 0);

local.setItem(cartStorageKey(table9, "guest-old"), JSON.stringify({
  updatedAt: Date.now() - 5 * 60 * 60 * 1000,
  lines: [line],
}));
assert.equal(readScopedCart(table9, "guest-old").length, 0);
clearScopedCart(table9, "guest-a");
assert.equal(readScopedCart(table9, "guest-a").length, 0);
assert.equal(readScopedCart(table10, "guest-b").length, 1);

console.log("cart scope ok");
