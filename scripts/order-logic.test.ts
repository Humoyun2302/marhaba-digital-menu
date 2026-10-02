import assert from "node:assert/strict";
import { addCartLine, canTransition, escapeHtml, forwardActions, payableTotal, resolveCart } from "../src/features/orders/policy.ts";
import type { Category } from "../src/types/menu";

const salad: Category = {
  id: "cat",
  slug: "salads",
  name_ru: "Салаты",
  name_en: "Salads",
  sort_order: 1,
  is_active: true,
  menu_items: [
    {
      id: "item",
      category_id: "cat",
      name_ru: "Цезарь",
      name_en: "Caesar",
      description_ru: null,
      description_en: null,
      image_url: null,
      is_available: true,
      is_featured: false,
      sort_order: 1,
      item_price_options: [
        { id: "small", item_id: "item", label_ru: "Малая", label_en: "Small", price: 70000, sort_order: 1 },
        { id: "large", item_id: "item", label_ru: "Большая", label_en: "Large", price: 90000, sort_order: 2 },
      ],
    },
  ],
};

const lines = addCartLine([], { itemId: "item", optionId: "large", quantity: 2, note: "без лука" });
const again = addCartLine(lines, { itemId: "item", optionId: "large", quantity: 1, note: "без лука" });
assert.equal(again.length, 1);
assert.equal(again[0]?.quantity, 3);

const resolved = resolveCart(again, [salad], "ru");
assert.equal(resolved[0]?.issue, "ok");
assert.equal(resolved[0]?.unitPrice, 90000);
assert.equal(payableTotal(resolved), 270000);
assert.equal(resolveCart([{ itemId: "item", optionId: "", quantity: 1, note: "" }], [salad], "ru")[0]?.issue, "variant");

assert.equal(canTransition("pending", "accepted"), true);
assert.equal(canTransition("pending", "preparing"), false);
assert.equal(canTransition("accepted", "preparing"), true);
assert.equal(canTransition("preparing", "ready"), true);
assert.equal(canTransition("ready", "served"), true);
assert.equal(canTransition("serving", "served"), true);
assert.equal(canTransition("pending", "cancelled"), true);
assert.equal(canTransition("preparing", "cancelled"), false);
assert.equal(canTransition("served", "cancelled"), false);
assert.deepEqual(forwardActions("pending"), ["accepted"]);
assert.deepEqual(forwardActions("ready"), ["served"]);
assert.equal(escapeHtml(`<b>A & B</b>`), "&lt;b&gt;A &amp; B&lt;/b&gt;");

console.log("order logic ok");
