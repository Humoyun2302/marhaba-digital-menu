import type { MenuItem } from "../../types/menu";

export type PhotoReview = "approved" | "needs_review";

export type BundledPhoto = {
  card: string;
  detail: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  review: PhotoReview;
};

export type DishPhoto = BundledPhoto & {
  origin: "stored" | "bundled";
};

export type ManualReviewNote = {
  id: string;
  reasonRu: string;
  reasonEn: string;
};

type PhotoItem = Pick<
  MenuItem,
  | "id"
  | "image_url"
  | "image_thumb_url"
  | "image_source"
  | "image_license"
  | "image_attribution"
  | "image_review_status"
  | "image_hidden"
>;

function photo(
  card: string,
  detail: string,
  sourceUrl: string,
  license: string,
  attribution: string,
  review: PhotoReview = "approved",
): BundledPhoto {
  return { card, detail, sourceUrl, license, attribution, review };
}

const commons = "https://commons.wikimedia.org/wiki/File:";

export const bundledPhotos: Record<string, BundledPhoto> = {
  "20000000-0000-4000-8000-000000000003": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000003-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000003-detail.webp",
    `${commons}Caesar_salad_(2).jpg`,
    "CC BY 2.0",
    "Geoff Peters",
  ),
  "20000000-0000-4000-8000-000000000004": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000004-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000004-detail.webp",
    `${commons}Greek_Salad_from_Thessaloniki.jpg`,
    "CC BY-SA 4.0",
    "Armineaghayan",
  ),
  "20000000-0000-4000-8000-000000000006": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000006-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000006-detail.webp",
    `${commons}Mercimek_%C3%A7orbasi.jpg`,
    "CC BY-SA 4.0",
    "E4024",
  ),
  "20000000-0000-4000-8000-000000000007": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000007-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000007-detail.webp",
    `${commons}Cream_Mushroom_soup_2.jpg`,
    "CC BY-SA 3.0",
    "Redeemer",
  ),
  "20000000-0000-4000-8000-000000000008": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000008-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000008-detail.webp",
    `${commons}Chicken_Noodle_Soup.jpg`,
    "CC BY-SA 3.0",
    "Hoyabird8",
  ),
  "20000000-0000-4000-8000-000000000012": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000012-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000012-detail.webp",
    `${commons}Fettuccine_ai_funghi_porcini.jpg`,
    "CC BY-SA 4.0",
    "Nicholas Gemini",
  ),
  "20000000-0000-4000-8000-000000000013": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000013-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000013-detail.webp",
    `${commons}-2020-09-16_Salmon_with_a_cream_cheese_and_chive_sauce_served_with_chips%2C_Trimingham_(1).JPG`,
    "CC BY-SA 4.0",
    "Kolforn",
  ),
  "20000000-0000-4000-8000-000000000015": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000015-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000015-detail.webp",
    `${commons}Chicken_sandwich.jpg`,
    "CC BY-SA 3.0",
    "Tmannya",
  ),
  "20000000-0000-4000-8000-000000000017": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000017-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000017-detail.webp",
    `${commons}Margherita_Originale.JPG`,
    "CC BY-SA 3.0",
    "Mario56",
  ),
  "20000000-0000-4000-8000-000000000018": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000018-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000018-detail.webp",
    `${commons}NCI_Visuals_Food_Hamburger.jpg`,
    "Public domain",
    "Len Rizzi",
  ),
  "20000000-0000-4000-8000-000000000022": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000022-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000022-detail.webp",
    `${commons}Medovik.jpg`,
    "CC BY 2.0",
    "Edinburgh blog",
  ),
  "20000000-0000-4000-8000-000000000023": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000023-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000023-detail.webp",
    `${commons}Passionsfruktscheesecake.jpg`,
    "CC BY-SA 4.0",
    "Mikaela Börjesson",
    "needs_review",
  ),
  "20000000-0000-4000-8000-000000000045": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000045-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000045-detail.webp",
    `${commons}Cup_of_black_tea.JPG`,
    "CC BY-SA 4.0",
    "AntanO",
  ),
  "20000000-0000-4000-8000-000000000046": photo(
    "/menu-photos/20000000-0000-4000-8000-000000000046-card.webp",
    "/menu-photos/20000000-0000-4000-8000-000000000046-detail.webp",
    `${commons}White_cup_with_green_tea_in_it.jpg`,
    "CC BY 3.0",
    "Douglas P Perkins",
  ),
};

export const manualReview: ManualReviewNote[] = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    reasonRu: "Не нашлось фото именно баклажана с кремом и сыром без другого блюда.",
    reasonEn: "No photograph clearly showed eggplant with cream and cheese.",
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    reasonRu: "Доступные кадры были ризотто или сгенерированным изображением, не салатом с рукколой.",
    reasonEn: "Available photos were a risotto plate or an AI-generated image, not a salmon and arugula salad.",
  },
  {
    id: "20000000-0000-4000-8000-000000000005",
    reasonRu: "Найденный кадр «том ям» показывал рыбные шарики, а не креветки.",
    reasonEn: "The available tom yum photograph showed fish balls rather than shrimp.",
  },
  {
    id: "20000000-0000-4000-8000-000000000009",
    reasonRu: "Нет уверенного фото медальона именно с ананасом.",
    reasonEn: "No confident photograph of a medallion served with pineapple.",
  },
  {
    id: "20000000-0000-4000-8000-000000000010",
    reasonRu: "Найденный кадр был панированной котлетой без видимой начинки кордон блю.",
    reasonEn: "The available photo was a breaded cutlet without a visible cordon bleu filling.",
  },
  {
    id: "20000000-0000-4000-8000-000000000011",
    reasonRu: "Казан-кебаб — местное блюдо, уверенного лицензированного фото нет.",
    reasonEn: "Kazan kebab is a regional dish, and no confident licensed photograph was found.",
  },
  {
    id: "20000000-0000-4000-8000-000000000014",
    reasonRu: "Результаты поиска показывали омлет и готовый дон, а не стейк с демигласом.",
    reasonEn: "Search results showed an omelette and a prepared rice bowl, not a steak with demi-glace.",
  },
  {
    id: "20000000-0000-4000-8000-000000000016",
    reasonRu: "Единственное явное фото пепперони содержало крупный логотип другой сети.",
    reasonEn: "The only clear pepperoni photograph carried another chain’s large logo.",
  },
  {
    id: "20000000-0000-4000-8000-000000000019",
    reasonRu: "Найденные шашлычки были в корейской глазури, это другой вид блюда.",
    reasonEn: "The available skewers were Korean glazed skewers, a different preparation.",
  },
  {
    id: "20000000-0000-4000-8000-000000000020",
    reasonRu: "Найденные картофельные гарниры были толстыми чипсами, а не картофелем фри.",
    reasonEn: "The available potato photos were thick-cut chips, not french fries.",
  },
  {
    id: "20000000-0000-4000-8000-000000000021",
    reasonRu: "«Юмча с ягодами» — местный десерт, уверенного фото нет.",
    reasonEn: "Yumcha with berries is a local dessert, and no confident photograph was found.",
  },
  {
    id: "20000000-0000-4000-8000-000000000023",
    reasonRu: "Фото чизкейка с жёлтой глазурью подписано как маракуйя. Проверьте, что это именно ваш десерт, и одобрите его.",
    reasonEn: "The cheesecake has a yellow glaze and is titled passion fruit. Confirm it matches this dessert, then approve it.",
  },
  {
    id: "20000000-0000-4000-8000-000000000024",
    reasonRu: "Нет кадра именно сан-себастьяна с шоколадом.",
    reasonEn: "No photograph clearly showed San Sebastian cheesecake with chocolate.",
  },
  {
    id: "20000000-0000-4000-8000-000000000038",
    reasonRu: "Кадр эспрессо нельзя было обрезать так, чтобы осталась чашка и не попал чужой бренд.",
    reasonEn: "The espresso photograph could not be cropped to keep the cup without another brand.",
  },
];

function storedPhoto(item: PhotoItem, allowReview: boolean): DishPhoto | null {
  if (!item.image_url) return null;
  const review: PhotoReview = item.image_review_status === "needs_review" ? "needs_review" : "approved";
  if (!allowReview && review === "needs_review") return null;
  return {
    card: item.image_thumb_url || item.image_url,
    detail: item.image_url,
    sourceUrl: item.image_source || "",
    license: item.image_license || "",
    attribution: item.image_attribution || "",
    review,
    origin: "stored",
  };
}

export function resolveDishPhoto(item: PhotoItem): DishPhoto | null {
  if (item.image_hidden) return null;
  const stored = storedPhoto(item, false);
  if (stored) return stored;
  if (item.image_url) return null;
  const bundled = bundledPhotos[item.id];
  if (!bundled || bundled.review !== "approved") return null;
  return { ...bundled, origin: "bundled" };
}

export function adminDishPhoto(item: PhotoItem): DishPhoto | null {
  if (item.image_hidden) return null;
  const stored = storedPhoto(item, true);
  if (stored) return stored;
  if (item.image_url) return null;
  const bundled = bundledPhotos[item.id];
  if (!bundled) return null;
  return { ...bundled, origin: "bundled" };
}
