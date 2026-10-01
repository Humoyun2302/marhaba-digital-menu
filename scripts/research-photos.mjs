const dishes = [
  ["20000000-0000-4000-8000-000000000001", "eggplant cheese salad"],
  ["20000000-0000-4000-8000-000000000002", "salmon arugula salad"],
  ["20000000-0000-4000-8000-000000000003", "Caesar salad"],
  ["20000000-0000-4000-8000-000000000004", "Greek salad"],
  ["20000000-0000-4000-8000-000000000005", "Tom yum soup shrimp"],
  ["20000000-0000-4000-8000-000000000006", "lentil soup"],
  ["20000000-0000-4000-8000-000000000007", "cream of mushroom soup"],
  ["20000000-0000-4000-8000-000000000008", "chicken noodle soup"],
  ["20000000-0000-4000-8000-000000000010", "chicken cordon bleu"],
  ["20000000-0000-4000-8000-000000000012", "fettuccine mushroom"],
  ["20000000-0000-4000-8000-000000000013", "salmon cream sauce"],
  ["20000000-0000-4000-8000-000000000014", "steak demi glace"],
  ["20000000-0000-4000-8000-000000000015", "chicken sandwich"],
  ["20000000-0000-4000-8000-000000000016", "pepperoni pizza"],
  ["20000000-0000-4000-8000-000000000017", "margherita pizza"],
  ["20000000-0000-4000-8000-000000000018", "beef burger"],
  ["20000000-0000-4000-8000-000000000019", "chicken skewers"],
  ["20000000-0000-4000-8000-000000000020", "french fries"],
  ["20000000-0000-4000-8000-000000000022", "medovik honey cake"],
  ["20000000-0000-4000-8000-000000000023", "passion fruit cheesecake"],
  ["20000000-0000-4000-8000-000000000038", "espresso coffee cup"],
  ["20000000-0000-4000-8000-000000000039", "americano coffee"],
  ["20000000-0000-4000-8000-000000000040", "cappuccino"],
  ["20000000-0000-4000-8000-000000000041", "latte coffee"],
  ["20000000-0000-4000-8000-000000000043", "affogato"],
  ["20000000-0000-4000-8000-000000000045", "black tea cup"],
  ["20000000-0000-4000-8000-000000000046", "green tea cup"],
  ["20000000-0000-4000-8000-000000000031", "mojito drink"],
];

function licenseOk(name) {
  const value = (name || "").toLowerCase();
  if (!value || /nc|nd|non-commercial|noncommercial|no derivatives/.test(value)) return false;
  return /cc0|public domain|cc by|cc-by|attribution/.test(value);
}

async function search(query) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `${query} filetype:bitmap`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "5");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size|mime|extmetadata");
  url.searchParams.set("iiurlwidth", "800");
  const response = await fetch(url, {
    headers: { "User-Agent": "MarhabaMenu/1.0 (restaurant menu photo research; contact: menu@marhaba.local)" },
  });
  if (!response.ok) throw new Error(`${query} ${response.status}`);
  const payload = await response.json();
  const pages = Object.values(payload.query?.pages ?? {});
  return pages
    .map((page) => {
      const info = page.imageinfo?.[0];
      const meta = info?.extmetadata ?? {};
      const license = meta.LicenseShortName?.value ?? "";
      return {
        title: page.title,
        license,
        width: info?.width ?? 0,
        height: info?.height ?? 0,
        mime: info?.mime ?? "",
        url: info?.url ?? "",
        thumb: info?.thumburl ?? "",
        artist: (meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").slice(0, 180),
        ok: licenseOk(license) && (info?.width ?? 0) >= 1000 && /jpeg|png|webp/.test(info?.mime ?? ""),
      };
    })
    .filter((page) => page.ok)
    .slice(0, 2);
}

const results = [];
for (const [id, query] of dishes) {
  try {
    const hits = await search(query);
    results.push({ id, query, hits });
    console.log(`${query}: ${hits.map((hit) => hit.title).join(" | ") || "none"}`);
  } catch (error) {
    console.log(`${query}: ERROR ${error.message}`);
    results.push({ id, query, hits: [], error: String(error.message) });
  }
}

const { writeFileSync } = await import("node:fs");
writeFileSync(new URL("./photo-candidates.json", import.meta.url), JSON.stringify(results, null, 2));
