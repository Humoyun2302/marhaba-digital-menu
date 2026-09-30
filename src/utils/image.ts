const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED.has(file.type)) return "type";
  if (file.size > MAX_BYTES) return "size";
  return null;
}

export async function compressImage(file: File): Promise<{ blob: Blob; contentType: string; extension: string }> {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Could not prepare the image");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const webp = await canvasToBlob(canvas, "image/webp", 0.82);
  if (webp) return { blob: webp, contentType: "image/webp", extension: "webp" };
  const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.86);
  if (jpeg) return { blob: jpeg, contentType: "image/jpeg", extension: "jpg" };
  throw new Error("Could not prepare the image");
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export function uploadWithProgress(options: {
  bucket: "menu-images" | "branding";
  path: string;
  blob: Blob;
  contentType: string;
  accessToken: string;
  onProgress: (ratio: number) => void;
}): Promise<string> {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const endpoint = `${base}/storage/v1/object/${options.bucket}/${options.path}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("Authorization", `Bearer ${options.accessToken}`);
    xhr.setRequestHeader("apikey", apiKey);
    xhr.setRequestHeader("Content-Type", options.contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(`${base}/storage/v1/object/public/${options.bucket}/${options.path}`);
        return;
      }
      reject(new Error(readUploadError(xhr.responseText)));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(options.blob);
  });
}

function readUploadError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message || parsed.error || "Upload failed";
  } catch {
    return body || "Upload failed";
  }
}
