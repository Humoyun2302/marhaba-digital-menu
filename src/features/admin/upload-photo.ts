import { compressImagePair, uploadWithProgress } from "../../utils/image";

export async function uploadDishPhoto(
  file: File,
  accessToken: string,
  onProgress: (ratio: number) => void,
): Promise<{ image_url: string; image_thumb_url: string }> {
  const prepared = await compressImagePair(file);
  const id = crypto.randomUUID();
  const detail = await uploadWithProgress({
    bucket: "menu-images",
    path: `${id}-detail.${prepared.extension}`,
    blob: prepared.detail,
    contentType: prepared.contentType,
    accessToken,
    onProgress: (ratio) => onProgress(ratio * 0.65),
  });
  const card = await uploadWithProgress({
    bucket: "menu-images",
    path: `${id}-card.${prepared.extension}`,
    blob: prepared.card,
    contentType: prepared.contentType,
    accessToken,
    onProgress: (ratio) => onProgress(0.65 + ratio * 0.35),
  });
  return { image_url: detail, image_thumb_url: card };
}
