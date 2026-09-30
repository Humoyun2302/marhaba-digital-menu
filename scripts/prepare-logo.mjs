import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const src = "D:/Downloads/marhaba/_pdfpreview/logo-hi-1.png";
const outDir = path.resolve("public/brand");
await mkdir(outDir, { recursive: true });

const image = sharp(src);
const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

let minX = width;
let minY = height;
let maxX = 0;
let maxY = 0;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r < 248 || g < 248 || b < 248) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
}

const pad = 12;
minX = Math.max(0, minX - pad);
minY = Math.max(0, minY - pad);
maxX = Math.min(width - 1, maxX + pad);
maxY = Math.min(height - 1, maxY + pad);

const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;

const cropped = await sharp(src)
  .extract({ left: minX, top: minY, width: cropW, height: cropH })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const pixels = cropped.data;
const w = cropped.info.width;
const h = cropped.info.height;
const ch = cropped.info.channels;

// Knock out near-white paper so the lockup sits cleanly on ivory.
for (let i = 0; i < pixels.length; i += ch) {
  const r = pixels[i];
  const g = pixels[i + 1];
  const b = pixels[i + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (min > 236 && max - min < 18) {
    const fade = Math.max(0, Math.min(255, (246 - min) * 12));
    pixels[i + 3] = fade;
  }
}

const transparent = sharp(pixels, { raw: { width: w, height: h, channels: ch } });

await transparent.clone().png().toFile(path.join(outDir, "logo.png"));

// Split mark and wordmark on the widest horizontal gap of transparent rows.
const rowInk = new Array(h).fill(0);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const a = pixels[(y * w + x) * ch + 3];
    if (a > 20) rowInk[y] += 1;
  }
}

let gapStart = -1;
let bestStart = 0;
let bestLen = 0;
for (let y = Math.floor(h * 0.25); y < Math.floor(h * 0.85); y++) {
  if (rowInk[y] < 8) {
    if (gapStart < 0) gapStart = y;
  } else if (gapStart >= 0) {
    const len = y - gapStart;
    if (len > bestLen) {
      bestLen = len;
      bestStart = gapStart;
    }
    gapStart = -1;
  }
}

const split = Math.min(
  h - 2,
  Math.max(2, bestLen > 8 ? bestStart + Math.floor(bestLen / 2) : Math.floor(h * 0.62)),
);
console.log({ bestStart, bestLen, split, w, h });

await sharp(pixels, { raw: { width: w, height: h, channels: ch } })
  .extract({ left: 0, top: 0, width: w, height: Math.max(1, split) })
  .png()
  .toFile(path.join(outDir, "mark-raw.png"));

await sharp(pixels, { raw: { width: w, height: h, channels: ch } })
  .extract({ left: 0, top: split, width: w, height: Math.max(1, h - split) })
  .png()
  .toFile(path.join(outDir, "word-raw.png"));

console.log({ width, height, crop: { minX, minY, cropW, cropH }, split, bestLen, out: { w, h } });
