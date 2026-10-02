const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "content-type": "application/json",
};

function json(status, body, extra = {}) {
  return { status, headers: { ...CORS, ...extra }, body: JSON.stringify(body) };
}

export async function handleRequest(request, ledger) {
  const url = new URL(request.url());
  if (request.method() === "OPTIONS") return { status: 204, headers: CORS, body: "" };
  const path = url.pathname;
  const accept = request.headers()["accept"] ?? "";
  const object = accept.includes("vnd.pgrst.object");

  try {
    if (path.endsWith("/rest/v1/categories")) return json(200, ledger.menu());
    if (path.endsWith("/rest/v1/site_settings")) {
      const settings = {
        id: "settings",
        restaurant_name: "MARHABA HOTEL & SPA",
        subtitle: null,
        logo_url: null,
        currency_code: "UZS",
        phone: null,
        address_ru: null,
        address_en: null,
        instagram_url: null,
        opening_hours_ru: null,
        opening_hours_en: null,
        qr_domain: null,
        qr_domain_locked: false,
        updated_at: new Date().toISOString(),
      };
      return json(200, object ? settings : [settings]);
    }
    if (path.endsWith("/rest/v1/admin_users")) {
      const row = { user_id: "11111111-1111-4111-8111-111111111111" };
      return json(200, object ? row : [row]);
    }
    if (path.endsWith("/rest/v1/rpc/record_qr_scan")) {
      const body = request.postDataJSON();
      return json(200, ledger.recordScan(body.p_token));
    }
    if (path.endsWith("/rest/v1/rpc/public_ordering_status")) {
      return json(200, {
        accepting: true,
        closed_reason: null,
        ordering_enabled: true,
        orders_paused: false,
        allow_outside_hours: true,
      });
    }
    if (path.endsWith("/rest/v1/rpc/open_guest_visit")) {
      const body = request.postDataJSON();
      return json(200, ledger.openVisit({
        token: body.p_token,
        secret: body.p_secret,
        forceNew: Boolean(body.p_force_new),
      }));
    }
    if (path.endsWith("/rest/v1/rpc/guest_active_orders")) {
      const body = request.postDataJSON();
      return json(200, ledger.ordersFor(body.p_secret));
    }
    if (path.endsWith("/rest/v1/rpc/admin_table_board")) return json(200, ledger.board());
    if (path.endsWith("/rest/v1/rpc/admin_release_table")) {
      const body = request.postDataJSON();
      return json(200, ledger.release(body.p_table_number, body.p_unfinished));
    }
    if (path.endsWith("/functions/v1/restaurant-orders")) {
      const body = request.postDataJSON();
      if (body.action === "create") {
        try {
          const created = ledger.createOrder({
            table_token: body.tableToken,
            session_secret: body.sessionSecret,
            idempotency_key: body.idempotencyKey,
            customer_name: body.customerName,
            special_instructions: body.specialInstructions,
            allergy_notes: body.allergyNotes,
            expected_total: body.expectedTotal,
            items: body.items,
          });
          return json(200, created);
        } catch (error) {
          if (error.code === "TIMEOUT") return { abort: true };
          return json(400, { error: error.code || "ORDER_FAILED" });
        }
      }
      if (body.action === "track") {
        const order = ledger.track(body.token);
        if (!order) return json(404, { error: "NOT_FOUND" });
        return json(200, { order });
      }
    }
    if (path.includes("/auth/v1/")) return json(200, { id: "11111111-1111-4111-8111-111111111111" });
    return json(404, { message: `UNMOCKED ${path}`, code: "PGRST204" });
  } catch (error) {
    return json(400, { message: error.code || error.message, code: "P0001" });
  }
}
