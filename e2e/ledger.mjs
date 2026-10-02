import { createHash, randomBytes, randomUUID } from "node:crypto";

export const TABLE9 = "9".repeat(48);
export const TABLE10 = "a".repeat(48);

const PLOV = "11111111-1111-4111-8111-111111111111";
const LAGMAN = "22222222-2222-4222-8222-222222222222";
const SALAD = "33333333-3333-4333-8333-333333333333";

const NEXT = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready"],
  ready: ["served"],
  serving: ["served"],
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function secret() {
  return randomBytes(32).toString("hex");
}

function dish(id, name, price) {
  return {
    id,
    category_id: "cat-hot",
    name_ru: name,
    name_en: name,
    description_ru: null,
    description_en: null,
    image_url: null,
    is_available: true,
    is_featured: false,
    sort_order: 1,
    item_price_options: [
      { id: `${id}-opt`, item_id: id, label_ru: null, label_en: null, price, sort_order: 1 },
    ],
  };
}

export function menuFixture(prices) {
  return [
    {
      id: "cat-hot",
      slug: "hot",
      name_ru: "Горячее",
      name_en: "Hot",
      sort_order: 1,
      is_active: true,
      menu_items: [
        dish(PLOV, "Плов", prices.get(PLOV) ?? 120000),
        dish(LAGMAN, "Лагман", prices.get(LAGMAN) ?? 90000),
        dish(SALAD, "Салат", prices.get(SALAD) ?? 70000),
      ],
    },
  ];
}

export const DISHES = { PLOV, LAGMAN, SALAD };

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function createLedger() {
  const tables = new Map([
    [TABLE9, 9],
    [TABLE10, 10],
  ]);
  const tokens = new Map([
    [9, TABLE9],
    [10, TABLE10],
  ]);
  const visits = new Map();
  const orders = [];
  const notifications = [];
  const updates = new Set();
  const prices = new Map();
  let seq = 1001;
  let failNext = null;
  let telegramDown = false;
  const chatId = "-1001";

  function findVisit(value) {
    if (!value || !/^[0-9a-f]{64}$/i.test(value)) return null;
    const hash = sha256(value.toLowerCase());
    return [...visits.values()].find((visit) => visit.secretHash === hash) ?? null;
  }

  function publicOrder(order, withToken = false) {
    const body = {
      id: order.id,
      public_order_number: order.publicNumber,
      table_number: order.tableNumber,
      order_status: order.status,
      customer_name: order.customerName,
      special_instructions: order.note,
      allergy_notes: order.allergy,
      total_amount: order.total,
      payment_status: "unpaid",
      prep_estimate_minutes: null,
      cancellation_reason: order.reason,
      created_at: order.createdAt,
      items: order.items,
      timeline: order.timeline,
    };
    if (withToken) body.tracking_token = order.trackingToken;
    return body;
  }

  function activeCount(visit) {
    return orders.filter((order) => order.visitId === visit.id && !["served", "cancelled"].includes(order.status)).length;
  }

  return {
    chatId,
    dishes: DISHES,
    get prices() {
      return prices;
    },
    setPrice(itemId, price) {
      prices.set(itemId, price);
    },
    setTelegramDown(value) {
      telegramDown = value;
    },
    failNextCreate(mode) {
      failNext = mode;
    },
    menu() {
      return menuFixture(prices);
    },
    recordScan(token) {
      const table = tables.get(token);
      return table ?? null;
    },
    openVisit({ token, secret: provided = "", forceNew = false }) {
      const tableNumber = tables.get(token);
      if (!tableNumber) throw fail("INVALID_TABLE");
      const existing = findVisit(provided);
      if (forceNew && existing && existing.token === token && existing.status === "active") {
        existing.status = "closed";
        existing.reason = "replaced";
      } else if (!forceNew && existing && existing.token === token && existing.status === "active") {
        const own = orders.filter((order) => order.visitId === existing.id);
        const active = own.filter((order) => !["served", "cancelled"].includes(order.status));
        if (active.length > 0 || own.length === 0) {
          existing.lastSeen = Date.now();
          return {
            session_id: existing.id,
            session_secret: existing.secret,
            table_number: tableNumber,
            resumed: true,
          };
        }
        existing.status = "closed";
        existing.reason = "completed";
      }
      const created = secret();
      const visit = {
        id: randomUUID(),
        secret: created,
        secretHash: sha256(created),
        token,
        tableNumber,
        status: "active",
        lastSeen: Date.now(),
      };
      visits.set(visit.id, visit);
      return {
        session_id: visit.id,
        session_secret: created,
        table_number: tableNumber,
        resumed: false,
      };
    },
    ordersFor(value) {
      const visit = findVisit(value);
      if (!visit || visit.status !== "active") throw fail("SESSION_INVALID");
      const own = orders.filter((order) => order.visitId === visit.id);
      return {
        active: own.filter((order) => !["served", "cancelled"].includes(order.status)).map((order) => publicOrder(order, true)),
        recent: own.filter((order) => ["served", "cancelled"].includes(order.status)).map((order) => publicOrder(order, true)),
      };
    },
    createOrder(payload) {
      if (failNext === "db") {
        failNext = null;
        throw fail("ORDER_FAILED");
      }
      if (failNext === "timeout") {
        failNext = null;
        throw fail("TIMEOUT");
      }
      const tableNumber = tables.get(payload.table_token);
      if (!tableNumber) throw fail("INVALID_TABLE");
      const visit = findVisit(payload.session_secret);
      if (!visit) throw fail("SESSION_INVALID");
      if (visit.status === "revoked") throw fail("SESSION_REVOKED");
      if (visit.status !== "active") throw fail("SESSION_EXPIRED");
      if (visit.token !== payload.table_token) throw fail("SESSION_TABLE_MISMATCH");
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (!items.length) throw fail("INVALID_ITEMS");
      const priced = items.map((item) => {
        const menuItem = menuFixture(prices)[0].menu_items.find((dishRow) => dishRow.id === item.menu_item_id);
        if (!menuItem || !menuItem.is_available) throw fail("ITEM_UNAVAILABLE");
        const option = menuItem.item_price_options.find((row) => row.id === item.price_option_id) ?? menuItem.item_price_options[0];
        if (!option) throw fail("VARIANT_REQUIRED");
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw fail("QUANTITY_LIMIT");
        return {
          id: randomUUID(),
          name_ru: menuItem.name_ru,
          name_en: menuItem.name_en,
          variant_ru: option.label_ru,
          variant_en: option.label_en,
          quantity,
          unit_price: option.price,
          line_total: option.price * quantity,
          special_instructions: item.special_instructions || null,
        };
      });
      const total = priced.reduce((sum, item) => sum + item.line_total, 0);
      if (payload.expected_total != null && Number(payload.expected_total) !== total) throw fail("PRICE_CHANGED");
      const key = String(payload.idempotency_key ?? "");
      const previous = orders.find((order) => order.idempotencyKey === key);
      if (previous) {
        if (previous.visitId !== visit.id) throw fail("IDEMPOTENCY_CONFLICT");
        return { replayed: true, tracking_token: previous.trackingToken, notification_status: previous.notification, order: publicOrder(previous) };
      }
      const order = {
        id: randomUUID(),
        publicNumber: seq,
        tableNumber,
        tableToken: payload.table_token,
        status: "pending",
        customerName: payload.customer_name || null,
        note: payload.special_instructions || null,
        allergy: payload.allergy_notes || null,
        total,
        reason: null,
        createdAt: new Date().toISOString(),
        items: priced,
        timeline: [{ id: randomUUID(), status: "pending", actor_type: "guest", actor_name: null, reason: null, created_at: new Date().toISOString() }],
        trackingToken: secret(),
        visitId: visit.id,
        idempotencyKey: key,
        notification: telegramDown ? "failed" : "sent",
      };
      seq += 1;
      orders.push(order);
      notifications.push({ orderId: order.id, status: order.notification, attempts: telegramDown ? 1 : 1 });
      return {
        replayed: false,
        tracking_token: order.trackingToken,
        notification_status: order.notification,
        order: publicOrder(order),
      };
    },
    track(token) {
      const order = orders.find((item) => item.trackingToken === token.toLowerCase());
      if (!order) return null;
      const visit = visits.get(order.visitId);
      if (visit && visit.status !== "active") return null;
      return publicOrder(order);
    },
    transition(orderId, toStatus, actor = "staff") {
      const order = orders.find((item) => item.id === orderId);
      if (!order) throw fail("NOT_FOUND");
      const allowed = NEXT[order.status] ?? [];
      if (!allowed.includes(toStatus) || toStatus === order.status) throw fail("INVALID_TRANSITION");
      order.status = toStatus;
      if (toStatus === "cancelled" && !order.reason) order.reason = "Отменено";
      order.timeline.push({
        id: randomUUID(),
        status: toStatus,
        actor_type: actor,
        actor_name: actor === "staff" ? "Сотрудник" : "Администратор",
        reason: toStatus === "cancelled" ? order.reason : null,
        created_at: new Date().toISOString(),
      });
      notifications.push({ orderId: order.id, status: telegramDown ? "failed" : "sent", attempts: 1 });
      return publicOrder(order);
    },
    callback({ updateId, data, chat, userId, member = true }) {
      if (updates.has(updateId)) return { duplicate: true, changed: false };
      updates.add(updateId);
      if (String(chat) !== chatId || !member) return { duplicate: false, changed: false, error: "NOT_ALLOWED" };
      const action = data.slice(0, 1);
      const map = { y: "accepted", n: "cancelled", k: "preparing", x: "cancelled", r: "ready", s: "served" };
      const next = map[action];
      const compact = data.slice(1);
      const order = orders.find((item) => item.id.replaceAll("-", "") === compact);
      if (!order || !next) return { duplicate: false, changed: false, error: "NOT_FOUND" };
      try {
        if (next === "cancelled") order.reason = action === "n" ? "Отклонено" : "Отменено";
        this.transition(order.id, next, "staff");
        return { duplicate: false, changed: true, status: order.status };
      } catch (error) {
        return { duplicate: false, changed: false, error: error.code };
      }
    },
    board() {
      return [9, 10].map((tableNumber) => ({
        table_number: tableNumber,
        active_orders: orders.filter((order) => order.tableNumber === tableNumber && !["served", "cancelled"].includes(order.status)).length,
        active_visits: [...visits.values()].filter((visit) => visit.tableNumber === tableNumber && visit.status === "active").length,
      }));
    },
    release(tableNumber, unfinished) {
      if (!["cancel", "serve"].includes(unfinished)) throw fail("CONFIRM_REQUIRED");
      const token = tokens.get(tableNumber);
      if (!token) throw fail("INVALID_TABLE");
      const before = token;
      const next = unfinished === "serve" ? "served" : "cancelled";
      let finished = 0;
      for (const order of orders) {
        if (order.tableToken !== token || ["served", "cancelled"].includes(order.status)) continue;
        order.status = next;
        order.reason = next === "cancelled" ? "Стол освобождён" : order.reason;
        order.timeline.push({
          id: randomUUID(),
          status: next,
          actor_type: "admin",
          actor_name: "Администратор",
          reason: "Стол освобождён",
          created_at: new Date().toISOString(),
        });
        finished += 1;
      }
      let revoked = 0;
      for (const visit of visits.values()) {
        if (visit.token === token && visit.status === "active") {
          visit.status = "revoked";
          visit.reason = "table_reset";
          revoked += 1;
        }
      }
      if (tokens.get(tableNumber) !== before) throw fail("QR_CHANGED");
      return { token: before, revoked_visits: revoked, finished_orders: finished, historical: orders.length };
    },
    snapshot() {
      return {
        orders: orders.map((order) => ({
          id: order.id,
          number: order.publicNumber,
          table: order.tableNumber,
          token: order.tableToken,
          status: order.status,
          total: order.total,
          visitId: order.visitId,
          customerName: order.customerName,
          trackingToken: order.trackingToken,
          notification: order.notification,
        })),
        visits: [...visits.values()].map((visit) => ({
          id: visit.id,
          table: visit.tableNumber,
          token: visit.token,
          status: visit.status,
        })),
        notifications,
        qr: { 9: tokens.get(9), 10: tokens.get(10) },
        activeOn(tableNumber, visitId) {
          return activeCount([...visits.values()].find((visit) => visit.id === visitId) ?? { id: visitId });
        },
      };
    },
  };
}
