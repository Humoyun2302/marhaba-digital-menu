import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const catalog = JSON.parse(readFileSync(new URL("./photo-candidates.json", import.meta.url), "utf8"));

const chosen = [
  { id: "20000000-0000-4000-8000-000000000003", title: "File:Caesar salad (2).jpg", review: "approved" },
  { id: "20000000-0000-4000-8000-000000000004", title: "File:Greek Salad from Thessaloniki.jpg", review: "approved" },
  { id: "20000000-0000-4000-8000-000000000006", title: "File:Mercimek çorbasi.jpg", review: "approved" },
  { id: "20000000-0000-4000-8000-000000000007", title: "File:Cream Mushroom soup 2.jpg", review: "approved" },
  { id: "20000000-0000-4000-8000-000000000008", title: "File:Chicken Noodle Soup.jpg", review: "approved" },
  { id: "20000000-0000-4000-8000-000000000012", title: "File:Fettuccine ai funghi porcini.jpg", review: "approved" },
  { id: "20000000-0000-4000-8000-000000000013", title: "File:-2020-09-16 Salmon with a cream cheese and chive sauce served with chips, Trimingham (1).JPG", review: "approved" },
  { id: "20000000-0000-4000-8000-000000000015", title: "File:Chicken sandwich.jpg", review: "approved" },
  { id: "20000000-0000-4000-8000-000000000017", title: "File:Margherita Originale.JPG", review: "approved" },
  { id: "20000000-0000-4000-8000-000000000018", title: "File:NCI Visuals Food Hamburger.jpg", review: "approved" },
  { id: "20000000-0000-4000-8000-000000000022", title: "File:Medovik.jpg", review: "approved" },
  { id: "20000000-0000-4000-8000-000000000023", title: "File:Passionsfruktscheesecake.jpg", review: "needs_review" },
  { id: "20000000-0000-4000-8000-000000000038", title: "File:Espresso cup.jpg", review: "approved", crop: "left" },
  { id: "20000000-0000-4000-8000-000000000045", title: "File:Cup of black tea.JPG", review: "approved" },
  { id: "20000000-0000-4000-8000-000000000046", title: "File:White cup with green tea in it.jpg", review: "approved" },
];

mkdirSync("public/menu-photos", { recursive: true });
const manifest = [];

for (const item of chosen) {
  const row = catalog.find((entry) => entry.id === item.id);
  const hit = row?.hits.find((entry) => entry.title === item.title);
  if (!hit) throw new Error(`Missing candidate ${item.title}`);
  const detailPath = `public/menu-photos/${item.id}-detail.webp`;
  const cardPath = `public/menu-photos/${item.id}-card.webp`;
  const fileName = item.title.replace(/^File:/, "");
  const page = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName.replace(/ /g, "_"))}`;
  if (!existsSync(detailPath) || !existsSync(cardPath)) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=2000`;
  let response = await fetch(url, { headers: { "User-Agent": "MarhabaMenu/1.0 (licensed photo import)" } });
  for (let attempt = 0; response.status === 429 && attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 12000));
    response = await fetch(url, { headers: { "User-Agent": "MarhabaMenu/1.0 (licensed photo import)" } });
  }
  if (!response.ok) throw new Error(`${item.id} ${response.status}`);
  let buffer = Buffer.from(await response.arrayBuffer());
  if (item.crop === "left") {
    const meta = await sharp(buffer).metadata();
    const width = Math.round((meta.width ?? 1) * 0.46);
    buffer = await sharp(buffer).extract({ left: 0, top: 0, width, height: meta.height ?? 1 }).toBuffer();
  }
  const base = sharp(buffer).rotate();
  const detail = await base.clone().resize(1600, 1200, { fit: "cover", position: "attention" }).webp({ quality: 78 }).toBuffer();
  const card = await base.clone().resize(960, 720, { fit: "cover", position: "attention" }).webp({ quality: 74 }).toBuffer();
  writeFileSync(detailPath, detail);
  writeFileSync(cardPath, card);
  console.log("saved", item.id, detail.length, card.length);
  await new Promise((resolve) => setTimeout(resolve, 1800));
  } else {
    console.log("exists", item.id);
  }
  manifest.push({
    id: item.id,
    review: item.review,
    license: hit.license,
    attribution: hit.artist.replace(/\s+/g, " ").trim(),
    sourceUrl: page,
    card: `/menu-photos/${item.id}-card.webp`,
    detail: `/menu-photos/${item.id}-detail.webp`,
  });
}

writeFileSync("scripts/photo-manifest.json", JSON.stringify(manifest, null, 2));
