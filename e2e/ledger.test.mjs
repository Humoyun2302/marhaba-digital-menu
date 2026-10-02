import assert from "node:assert/strict";
import test from "node:test";
import { createLedger, DISHES, TABLE9, TABLE10 } from "./ledger.mjs";

function item(id, optionSuffix, quantity = 1) {
  return { menu_item_id: id, price_option_id: `${id}-opt`, quantity, special_instructions: "" };
}

test("same table, two guests stay isolated", () => {
  const ledger = createLedger();
  const phoneA = ledger.openVisit({ token: TABLE10 });
  const phoneB = ledger.openVisit({ token: TABLE10 });
  assert.notEqual(phoneA.session_id, phoneB.session_id);
  const orderA = ledger.createOrder({
    table_token: TABLE10,
    session_secret: phoneA.session_secret,
    idempotency_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    customer_name: "Алия",
    items: [item(DISHES.PLOV)],
  });
  const orderB = ledger.createOrder({
    table_token: TABLE10,
    session_secret: phoneB.session_secret,
    idempotency_key: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    customer_name: "Бек",
    items: [item(DISHES.LAGMAN)],
  });
  assert.equal(orderA.order.table_number, 10);
  assert.equal(orderB.order.table_number, 10);
  const seenA = ledger.ordersFor(phoneA.session_secret);
  const seenB = ledger.ordersFor(phoneB.session_secret);
  assert.equal(seenA.active.length, 1);
  assert.equal(seenA.active[0].customer_name, "Алия");
  assert.equal(seenB.active[0].customer_name, "Бек");
  assert.equal(seenA.active.some((order) => order.customer_name === "Бек"), false);
});

test("duplicate checkout and parallel callbacks do not double-apply", () => {
  const ledger = createLedger();
  const visit = ledger.openVisit({ token: TABLE9 });
  const key = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const first = ledger.createOrder({
    table_token: TABLE9,
    session_secret: visit.session_secret,
    idempotency_key: key,
    items: [item(DISHES.SALAD, "", 2)],
  });
  const second = ledger.createOrder({
    table_token: TABLE9,
    session_secret: visit.session_secret,
    idempotency_key: key,
    items: [item(DISHES.SALAD, "", 2)],
  });
  assert.equal(second.replayed, true);
  assert.equal(second.tracking_token, first.tracking_token);
  assert.equal(ledger.snapshot().orders.length, 1);
  const compact = first.order.id.replaceAll("-", "");
  const one = ledger.callback({ updateId: 1, data: `y${compact}`, chat: ledger.chatId, userId: 5 });
  const again = ledger.callback({ updateId: 1, data: `y${compact}`, chat: ledger.chatId, userId: 5 });
  const raced = ledger.callback({ updateId: 2, data: `y${compact}`, chat: ledger.chatId, userId: 6 });
  assert.equal(one.changed, true);
  assert.equal(again.duplicate, true);
  assert.equal(raced.error, "INVALID_TRANSITION");
  assert.equal(ledger.snapshot().orders[0].status, "accepted");
  const outsider = ledger.callback({ updateId: 3, data: `k${compact}`, chat: "-9", userId: 7, member: false });
  assert.equal(outsider.error, "NOT_ALLOWED");
  assert.equal(ledger.snapshot().orders[0].status, "accepted");
});

test("telegram and database failures do not lose or duplicate the order", () => {
  const ledger = createLedger();
  const visit = ledger.openVisit({ token: TABLE9 });
  ledger.setTelegramDown(true);
  const saved = ledger.createOrder({
    table_token: TABLE9,
    session_secret: visit.session_secret,
    idempotency_key: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    items: [item(DISHES.PLOV)],
  });
  assert.equal(saved.notification_status, "failed");
  assert.equal(saved.order.public_order_number > 0, true);
  assert.equal(ledger.snapshot().orders.length, 1);
  ledger.failNextCreate("db");
  assert.throws(() => ledger.createOrder({
    table_token: TABLE9,
    session_secret: visit.session_secret,
    idempotency_key: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    items: [item(DISHES.LAGMAN)],
  }), /ORDER_FAILED/);
  assert.equal(ledger.snapshot().orders.length, 1);
});

test("server prices win and a released table revokes the old visit", () => {
  const ledger = createLedger();
  const visit = ledger.openVisit({ token: TABLE9 });
  ledger.setPrice(DISHES.PLOV, 150000);
  const order = ledger.createOrder({
    table_token: TABLE9,
    session_secret: visit.session_secret,
    idempotency_key: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    items: [item(DISHES.PLOV)],
  });
  assert.equal(order.order.total_amount, 150000);
  const tokenBefore = ledger.snapshot().qr[9];
  const released = ledger.release(9, "cancel");
  assert.equal(released.token, tokenBefore);
  assert.equal(released.finished_orders, 1);
  assert.equal(ledger.track(order.tracking_token), null);
  assert.throws(() => ledger.createOrder({
    table_token: TABLE9,
    session_secret: visit.session_secret,
    idempotency_key: "99999999-9999-4999-8999-999999999999",
    items: [item(DISHES.SALAD)],
  }), /SESSION_REVOKED/);
  const next = ledger.openVisit({ token: TABLE9, secret: visit.session_secret });
  assert.equal(next.resumed, false);
  assert.notEqual(next.session_id, visit.session_id);
  assert.equal(ledger.ordersFor(next.session_secret).active.length, 0);
  assert.equal(ledger.snapshot().orders.length, 1);
  assert.equal(ledger.snapshot().orders[0].status, "cancelled");
});

test("every telegram status button updates the stored order once", () => {
  const ledger = createLedger();
  const visit = ledger.openVisit({ token: TABLE9 });
  const created = ledger.createOrder({
    table_token: TABLE9,
    session_secret: visit.session_secret,
    idempotency_key: "15151515-1515-4151-8151-151515151515",
    items: [item(DISHES.PLOV)],
  });
  const compact = created.order.id.replaceAll("-", "");
  const steps = [
    [10, "y", "accepted"],
    [11, "k", "preparing"],
    [12, "r", "ready"],
    [13, "s", "served"],
  ];
  for (const [updateId, action, status] of steps) {
    const result = ledger.callback({ updateId, data: `${action}${compact}`, chat: ledger.chatId, userId: 4 });
    assert.equal(result.changed, true);
    assert.equal(ledger.snapshot().orders[0].status, status);
  }
  const other = ledger.openVisit({ token: TABLE10 });
  const cancelled = ledger.createOrder({
    table_token: TABLE10,
    session_secret: other.session_secret,
    idempotency_key: "16161616-1616-4161-8161-161616161616",
    items: [item(DISHES.SALAD)],
  });
  const cancelId = cancelled.order.id.replaceAll("-", "");
  const rejected = ledger.callback({ updateId: 20, data: `n${cancelId}`, chat: ledger.chatId, userId: 4 });
  assert.equal(rejected.changed, true);
  assert.equal(ledger.snapshot().orders[1].status, "cancelled");
  assert.equal(ledger.track(cancelled.tracking_token)?.cancellation_reason, "Отклонено");
});

test("completing one order keeps the guest's other order", () => {
  const ledger = createLedger();
  const visit = ledger.openVisit({ token: TABLE10 });
  const first = ledger.createOrder({
    table_token: TABLE10,
    session_secret: visit.session_secret,
    idempotency_key: "12121212-1212-4121-8121-121212121212",
    items: [item(DISHES.PLOV)],
  });
  ledger.createOrder({
    table_token: TABLE10,
    session_secret: visit.session_secret,
    idempotency_key: "13131313-1313-4131-8131-131313131313",
    items: [item(DISHES.LAGMAN)],
  });
  for (const status of ["accepted", "preparing", "ready", "served"]) {
    ledger.transition(first.order.id, status);
  }
  const board = ledger.ordersFor(visit.session_secret);
  assert.equal(board.active.length, 1);
  assert.equal(board.active[0].items[0].name_ru, "Лагман");
  assert.equal(board.recent.length, 1);
  const resumed = ledger.openVisit({ token: TABLE10, secret: visit.session_secret });
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.session_id, visit.session_id);
});

test("a finished visit is not restored for the next scan", () => {
  const ledger = createLedger();
  const visit = ledger.openVisit({ token: TABLE9 });
  const order = ledger.createOrder({
    table_token: TABLE9,
    session_secret: visit.session_secret,
    idempotency_key: "14141414-1414-4141-8141-141414141414",
    customer_name: "Старый гость",
    special_instructions: "без лука",
    items: [item(DISHES.SALAD)],
  });
  for (const status of ["accepted", "preparing", "ready", "served"]) ledger.transition(order.order.id, status);
  const next = ledger.openVisit({ token: TABLE9, secret: visit.session_secret });
  assert.equal(next.resumed, false);
  assert.equal(ledger.track(order.tracking_token), null);
  assert.equal(ledger.ordersFor(next.session_secret).active.length, 0);
  assert.equal(ledger.snapshot().orders[0].customerName, "Старый гость");
});
