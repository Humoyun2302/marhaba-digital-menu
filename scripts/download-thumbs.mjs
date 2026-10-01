import { mkdirSync, writeFileSync } from "node:fs";

const files = [
  ["001", "Patlıcan salad with cheese.jpg"],
  ["003", "Caesar salad (2).jpg"],
  ["004", "Greek Salad from Thessaloniki.jpg"],
  ["005", "Shrimp Tom yum soup from a Thai restaurant in Delray Beach, Florida.jpg"],
  ["006", "Mercimek çorbasi.jpg"],
  ["007", "Cream Mushroom soup 2.jpg"],
  ["008", "Chicken Noodle Soup.jpg"],
  ["010", "Chicken cordon bleu, Bee's Steak and Shake, Sleman, Yogyakarta.jpg"],
  ["012", "Fettuccine ai funghi porcini.jpg"],
  ["013", "-2020-09-16 Salmon with a cream cheese and chive sauce served with chips, Trimingham (1).JPG"],
  ["015", "Chicken sandwich.jpg"],
  ["016", "Pepperoni Pizza - Greggs 2024-03-16.jpg"],
  ["017", "Margherita Originale.JPG"],
  ["018", "NCI Visuals Food Hamburger.jpg"],
  ["019", "Dak-kkochi 2.jpg"],
  ["020", "Plate of chips at the Chalet Cafe, Cowfold, West Sussex, England.jpg"],
  ["022", "Medovik.jpg"],
  ["023", "Passionsfruktscheesecake.jpg"],
  ["031", "Virgin Mojito 01.jpg"],
  ["038", "Espresso cup.jpg"],
  ["039", "Caffè americano in the Philippines.jpg"],
  ["040", "Cappuccino 6.jpg"],
  ["043", "Affogato.JPG"],
  ["045", "Cup of black tea.JPG"],
  ["046", "White cup with green tea in it.jpg"],
];

mkdirSync("tmp-photos", { recursive: true });
for (const [id, name] of files) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=720`;
  const response = await fetch(url, { headers: { "User-Agent": "MarhabaMenu/1.0 (photo review)" } });
  if (!response.ok) {
    console.log("FAIL", id, response.status);
    continue;
  }
  const type = response.headers.get("content-type") || "";
  const ext = type.includes("png") ? "png" : "jpg";
  const buf = Buffer.from(await response.arrayBuffer());
  writeFileSync(`tmp-photos/${id}.${ext}`, buf);
  console.log("OK", id, buf.length);
}
