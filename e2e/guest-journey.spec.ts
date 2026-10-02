import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createLedger, DISHES, TABLE10, TABLE9 } from "./ledger.mjs";
import { handleRequest } from "./gateway.mjs";

type Ledger = ReturnType<typeof createLedger>;

async function install(context: BrowserContext, ledger: Ledger) {
  await context.route(/127\.0\.0\.1:5999/, async (route) => {
    const request = route.request();
    const result = await handleRequest(request, ledger);
    if ("abort" in result && result.abort) {
      await route.abort("timedout");
      return;
    }
    await route.fulfill(result);
  });
}

async function openTable(page: Page, token: string, table: string) {
  await page.goto(`/t/${token}`);
  await expect(page.locator(`[data-table="${table}"]`)).toBeVisible();
}

async function addDish(page: Page, name: string) {
  const card = page.getByRole("article").filter({ hasText: name });
  await card.getByRole("button", { name: "Добавить" }).click();
}

async function cartCount(page: Page) {
  const button = page.locator("[data-cart-count]");
  if (await button.count() === 0) return 0;
  return Number(await button.first().getAttribute("data-cart-count"));
}

async function checkout(page: Page) {
  await page.locator("[data-cart-count]").click();
  await page.getByRole("button", { name: "Оформить" }).click();
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("#");
}

test("A different QR codes on one device keep separate carts", async ({ page }) => {
  const ledger = createLedger();
  await install(page.context(), ledger);
  await openTable(page, TABLE9, "9");
  await addDish(page, "Плов");
  await addDish(page, "Лагман");
  await expect.poll(() => cartCount(page)).toBe(2);

  await openTable(page, TABLE10, "10");
  await expect.poll(() => cartCount(page)).toBe(0);
  await addDish(page, "Салат");
  await expect.poll(() => cartCount(page)).toBe(1);
  await page.locator("[data-cart-count]").click();
  const sheet = page.locator(".cart-sheet");
  await expect(sheet.getByText("Салат")).toBeVisible();
  await expect(sheet.getByText("Плов")).toHaveCount(0);

  await page.getByRole("button", { name: "Оформить" }).click();
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("#");
  await expect(page.getByText("Стол №010")).toBeVisible();
  expect(ledger.snapshot().orders).toHaveLength(1);
  expect(ledger.snapshot().orders[0]?.table).toBe(10);
  expect(ledger.snapshot().orders[0]?.token).toBe(TABLE10);

  await openTable(page, TABLE9, "9");
  await expect.poll(() => cartCount(page)).toBe(2);
});

test("B two devices at the same table cannot see each other", async ({ browser }) => {
  const ledger = createLedger();
  const phoneA = await browser.newContext();
  const phoneB = await browser.newContext();
  await install(phoneA, ledger);
  await install(phoneB, ledger);
  const pageA = await phoneA.newPage();
  const pageB = await phoneB.newPage();
  await openTable(pageA, TABLE10, "10");
  await openTable(pageB, TABLE10, "10");
  await addDish(pageA, "Плов");
  await addDish(pageB, "Лагман");
  await expect.poll(() => cartCount(pageA)).toBe(1);
  await expect.poll(() => cartCount(pageB)).toBe(1);
  await checkout(pageA);
  await checkout(pageB);
  const orders = ledger.snapshot().orders;
  expect(orders).toHaveLength(2);
  expect(orders.every((order) => order.table === 10)).toBe(true);
  expect(new Set(orders.map((order) => order.visitId)).size).toBe(2);
  await pageA.goto("/my-orders");
  await pageB.goto("/my-orders");
  await expect(pageA.getByText("Плов")).toHaveCount(0);
  await expect(pageB.getByText(`#${orders[0]?.number}`)).toHaveCount(0);
  await expect(pageB.getByText(`#${orders[1]?.number}`)).toBeVisible();
  await expect(pageA.getByText(`#${orders[0]?.number}`)).toBeVisible();
  await phoneA.close();
  await phoneB.close();
});

test("C refresh keeps the active cart on the same table", async ({ page }) => {
  const ledger = createLedger();
  await install(page.context(), ledger);
  await openTable(page, TABLE9, "9");
  await addDish(page, "Плов");
  await addDish(page, "Салат");
  await page.reload();
  await expect(page.locator('[data-table="9"]')).toBeVisible();
  await expect.poll(() => cartCount(page)).toBe(2);
  await openTable(page, TABLE10, "10");
  await expect.poll(() => cartCount(page)).toBe(0);
});

test("D served order leaves the guest view and stays in history", async ({ page }) => {
  const ledger = createLedger();
  await install(page.context(), ledger);
  await openTable(page, TABLE9, "9");
  await addDish(page, "Плов");
  await checkout(page);
  const order = ledger.snapshot().orders[0];
  expect(order).toBeTruthy();
  for (const [status, text] of [
    ["accepted", "Ресторан принял ваш заказ"],
    ["preparing", "Ваш заказ готовится"],
    ["ready", "Ваш заказ готов"],
    ["served", "Ваш заказ доставлен к столу"],
  ] as const) {
    ledger.transition(order!.id, status);
    await expect(page.locator(".bg-burgundy", { hasText: text })).toBeVisible();
  }
  await expect(page.getByText("Заказ подан")).toBeVisible();
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.locator('[data-table="9"]')).toBeVisible();
  await expect.poll(() => cartCount(page)).toBe(0);
  await page.goto("/my-orders");
  await expect(page.getByText("Сейчас нет активных заказов")).toBeVisible();
  expect(ledger.snapshot().orders[0]?.status).toBe("served");
  expect(ledger.track(order!.trackingToken)).toBeNull();
});

test("E the next guest gets an empty visit and no old tracking", async ({ browser }) => {
  const ledger = createLedger();
  const first = await browser.newContext();
  await install(first, ledger);
  const page = await first.newPage();
  await openTable(page, TABLE9, "9");
  await addDish(page, "Лагман");
  await checkout(page);
  const previous = ledger.snapshot().orders[0];
  for (const status of ["accepted", "preparing", "ready", "served"] as const) ledger.transition(previous!.id, status);
  await expect(page.getByText("Заказ подан")).toBeVisible();
  await page.getByRole("button", { name: "Готово" }).click();
  await expect.poll(() => cartCount(page)).toBe(0);

  const next = await browser.newContext();
  await install(next, ledger);
  const fresh = await next.newPage();
  await openTable(fresh, TABLE9, "9");
  await expect.poll(() => cartCount(fresh)).toBe(0);
  await fresh.goto("/my-orders");
  await expect(fresh.getByText("Сейчас нет активных заказов")).toBeVisible();
  await fresh.goto(`/order/${previous!.trackingToken}`);
  await expect(fresh.getByText("Заказ не найден")).toBeVisible();

  await page.goto(`/t/${TABLE9}`);
  await expect(page.locator('[data-table="9"]')).toBeVisible();
  await expect.poll(() => cartCount(page)).toBe(0);
  await page.goto(`/order/${previous!.trackingToken}`);
  await expect(page.getByText("Заказ не найден")).toBeVisible();
  expect(ledger.snapshot().qr[9]).toBe(TABLE9);
  await first.close();
  await next.close();
});

test("F one completed order does not drop the guest's other order", async ({ page }) => {
  const ledger = createLedger();
  await install(page.context(), ledger);
  await openTable(page, TABLE10, "10");
  await addDish(page, "Плов");
  await checkout(page);
  const first = ledger.snapshot().orders[0];
  const sessionBefore = await page.evaluate(() => JSON.parse(sessionStorage.getItem("marhaba:active-visit:v2") ?? "{}").sessionId);
  await page.goto("/");
  await expect(page.locator('[data-table="10"]')).toBeVisible();
  await addDish(page, "Салат");
  await checkout(page);
  expect(ledger.snapshot().orders).toHaveLength(2);
  for (const status of ["accepted", "preparing", "ready", "served"] as const) ledger.transition(first!.id, status);
  await page.goto("/my-orders");
  await expect(page.getByRole("link", { name: new RegExp(`#${ledger.snapshot().orders[1]?.number}`) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`#${first!.number}`) })).toHaveCount(0);
  const sessionAfter = await page.evaluate(() => JSON.parse(sessionStorage.getItem("marhaba:active-visit:v2") ?? "{}").sessionId);
  expect(sessionAfter).toBe(sessionBefore);
  expect(ledger.track(ledger.snapshot().orders[1]!.trackingToken)?.order_status).toBe("pending");
});

test("H a timed-out checkout keeps the cart and does not create an order", async ({ page }) => {
  const ledger = createLedger();
  await install(page.context(), ledger);
  await openTable(page, TABLE9, "9");
  await addDish(page, "Плов");
  ledger.failNextCreate("timeout");
  await page.locator("[data-cart-count]").click();
  await page.getByRole("button", { name: "Оформить" }).click();
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByText("Плов")).toBeVisible();
  expect(ledger.snapshot().orders).toHaveLength(0);
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("#");
  expect(ledger.snapshot().orders).toHaveLength(1);
});

test("H database failure does not save an order", async ({ page }) => {
  const ledger = createLedger();
  await install(page.context(), ledger);
  await openTable(page, TABLE9, "9");
  await addDish(page, "Салат");
  ledger.failNextCreate("db");
  await page.locator("[data-cart-count]").click();
  await page.getByRole("button", { name: "Оформить" }).click();
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByText("Не удалось отправить заказ")).toBeVisible();
  await expect(page.getByText("Салат")).toBeVisible();
  expect(ledger.snapshot().orders).toHaveLength(0);
});

test("price change must be confirmed before the order is saved", async ({ page }) => {
  const ledger = createLedger();
  await install(page.context(), ledger);
  await openTable(page, TABLE9, "9");
  await addDish(page, "Плов");
  await page.locator("[data-cart-count]").click();
  await page.getByRole("button", { name: "Оформить" }).click();
  await page.waitForURL("**/checkout");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main").getByText("120 000").first()).toBeVisible();
  ledger.setPrice(DISHES.PLOV, 150000);
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByText("Цены обновлены")).toBeVisible();
  await expect(page.locator("main").getByText("150 000").first()).toBeVisible();
  expect(ledger.snapshot().orders).toHaveLength(0);
  await page.getByRole("button", { name: "Подтвердить новую сумму" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("#");
  expect(ledger.snapshot().orders[0]?.total).toBe(150000);
});

test("I releasing a table revokes the guest and keeps the QR token", async ({ browser }) => {
  const ledger = createLedger();
  const guestContext = await browser.newContext();
  const adminContext = await browser.newContext();
  await install(guestContext, ledger);
  await install(adminContext, ledger);
  const guest = await guestContext.newPage();
  await openTable(guest, TABLE9, "9");
  await addDish(guest, "Плов");
  await checkout(guest);
  const tracking = guest.url();
  const tokenBefore = ledger.snapshot().qr[9];

  const admin = await adminContext.newPage();
  await admin.addInitScript(() => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({
      access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.e2e",
      refresh_token: "refresh",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: 4_000_000_000,
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        aud: "authenticated",
        role: "authenticated",
        email: "admin@marhaba.test",
      },
    }));
  });
  await admin.goto("/admin/tables");
  const card = admin.getByRole("article").filter({ hasText: "№009" });
  await expect(card.getByText("Активных заказов: 1")).toBeVisible();
  await card.getByRole("button", { name: "Освободить стол" }).click();
  await admin.getByRole("button", { name: "Отменить незавершённые" }).click();
  await expect(admin.getByText("Стол освобождён")).toBeVisible();
  expect(ledger.snapshot().qr[9]).toBe(tokenBefore);
  expect(ledger.snapshot().orders[0]?.status).toBe("cancelled");

  await guest.goto(tracking);
  await expect(guest.getByText("Заказ не найден")).toBeVisible();
  const next = await browser.newContext();
  await install(next, ledger);
  const fresh = await next.newPage();
  await openTable(fresh, TABLE9, "9");
  await expect.poll(() => cartCount(fresh)).toBe(0);
  await addDish(fresh, "Салат");
  await checkout(fresh);
  expect(ledger.snapshot().orders).toHaveLength(2);
  expect(ledger.snapshot().orders[1]?.table).toBe(9);
  expect(ledger.snapshot().orders[1]?.visitId).not.toBe(ledger.snapshot().orders[0]?.visitId);
  await guestContext.close();
  await adminContext.close();
  await next.close();
});
