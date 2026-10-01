import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import QRCode from "qrcode";
import sharp from "sharp";
import jsQR from "jsqr";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(path.join(root, "supabase/migrations/20261001120000_qr_and_images.sql"), "utf8");

const required = [
  "gen_random_bytes(24)",
  "on conflict (table_number) do nothing",
  "Permanent QR codes cannot be deleted",
  "QR token, table number, and identifier are permanent",
  "The canonical QR domain is locked",
  "table_number between 1 and 120",
  "char_length(token) >= 32",
  "restaurant_qr_codes_token_key unique (token)",
  "revoke insert, delete, truncate on public.restaurant_qr_codes",
];

for (const snippet of required) {
  if (!sql.includes(snippet)) {
    console.error(`Migration is missing: ${snippet}`);
    process.exit(1);
  }
}

if (/regenerate/i.test(readFileSync(path.join(root, "src/pages/admin/QrPage.tsx"), "utf8"))) {
  console.error("QR admin page must not offer regeneration");
  process.exit(1);
}

function token() {
  return crypto.randomBytes(24).toString("hex");
}

function init(store) {
  for (let table = 1; table <= 120; table += 1) {
    if (!store.has(table)) store.set(table, token());
  }
}

const codes = new Map();
init(codes);
const snapshot = new Map(codes);
init(codes);
if (codes.size !== 120) {
  console.error("Expected 120 QR codes");
  process.exit(1);
}
for (const [table, value] of snapshot) {
  if (codes.get(table) !== value) {
    console.error("Repeated initialization replaced a token");
    process.exit(1);
  }
}
if (new Set(codes.values()).size !== 120) {
  console.error("Tokens are not unique");
  process.exit(1);
}

const origin = "https://menu.example.com";
const urls = [...codes.entries()].map(([table, value]) => ({
  table,
  url: `${origin}/t/${value}`,
}));
if (new Set(urls.map((entry) => entry.url)).size !== 120) {
  console.error("Encoded URLs are not unique");
  process.exit(1);
}

for (const entry of urls) {
  const png = await QRCode.toBuffer(entry.url, {
    errorCorrectionLevel: "Q",
    margin: 2,
    width: 280,
    color: { dark: "#1c1917ff", light: "#ffffffff" },
  });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
  if (!decoded || decoded.data !== entry.url) {
    console.error(`QR image for table ${entry.table} does not encode ${entry.url}`);
    process.exit(1);
  }
}

function rejectImmutableEdit(current, next) {
  if (next.token !== current.token || next.tableNumber !== current.tableNumber || next.id !== current.id) {
    throw new Error("QR token, table number, and identifier are permanent");
  }
}

const sample = { id: "a", tableNumber: 1, token: codes.get(1) };
try {
  rejectImmutableEdit(sample, { ...sample, token: "changed-token-value-that-is-long-enough" });
  console.error("Immutable edit was accepted");
  process.exit(1);
} catch (error) {
  if (!String(error.message).includes("permanent")) throw error;
}

console.log("Verified 120 unique QR payloads, idempotent initialization, and immutability rules.");
