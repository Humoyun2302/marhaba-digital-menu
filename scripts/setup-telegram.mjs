import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || "jwbfthadjyfwxpahmwid";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim() ?? "";
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || randomBytes(32).toString("hex");
const chatId = process.env.TELEGRAM_ORDERS_CHAT_ID?.trim() ?? "";

if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
  console.error("Set TELEGRAM_BOT_TOKEN in the environment. Do not paste it into source files or chat.");
  process.exit(1);
}

const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/telegram-webhook`;
await mkdir(".secrets", { recursive: true });
const secretFile = [
  `TELEGRAM_WEBHOOK_SECRET=${webhookSecret}`,
  chatId ? `TELEGRAM_ORDERS_CHAT_ID=${chatId}` : "",
  `WEBHOOK_URL=${webhookUrl}`,
  "",
].filter(Boolean).join("\n");
await writeFile(".secrets/telegram.env", `${secretFile}\n`, { flag: "w" });
console.log("Webhook secret saved to .secrets/telegram.env. This file is gitignored.");

if (accessToken) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify([
      { name: "TELEGRAM_BOT_TOKEN", value: token },
      { name: "TELEGRAM_WEBHOOK_SECRET", value: webhookSecret },
      ...(chatId ? [{ name: "TELEGRAM_ORDERS_CHAT_ID", value: chatId }] : []),
    ]),
  });
  if (!response.ok) {
    console.error(`Supabase secrets were not saved (${response.status}). Add them in the dashboard instead.`);
    process.exitCode = 1;
  } else {
    console.log("Supabase Edge Function secrets were saved. The bot token was not printed.");
  }
} else {
  console.log("SUPABASE_ACCESS_TOKEN is not set. Add the secrets in the Supabase dashboard, using .secrets/telegram.env for the webhook secret only.");
}

const webhook = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  }),
});
const webhookBody = await webhook.json();
console.log("setWebhook:", webhookBody.ok === true ? "accepted by Telegram" : "rejected by Telegram");
if (webhookBody.description) console.log(webhookBody.description);

const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
const infoBody = await info.json();
const result = infoBody.result ?? {};
console.log("getWebhookInfo:");
console.log(`  url: ${result.url || "(empty)"}`);
console.log(`  pending_update_count: ${result.pending_update_count ?? "unknown"}`);
console.log(`  last_error_message: ${result.last_error_message || "(none)"}`);
console.log(`  has_custom_certificate: ${Boolean(result.has_custom_certificate)}`);

const me = await fetch(`https://api.telegram.org/bot${token}/getMe`);
const meBody = await me.json();
if (meBody.ok) console.log(`Bot: @${meBody.result.username} (id ${meBody.result.id})`);
else console.log("getMe failed. The token was not accepted.");

if (!webhookBody.ok || result.url !== webhookUrl) process.exitCode = 1;
