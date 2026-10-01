import JSZip from "jszip";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

const CARD_WIDTH = 900;
const CARD_HEIGHT = 1200;

export const QR_RANGES = [
  { id: "all", from: 1, to: 120 },
  { id: "001-030", from: 1, to: 30 },
  { id: "031-060", from: 31, to: 60 },
  { id: "061-090", from: 61, to: 90 },
  { id: "091-120", from: 91, to: 120 },
] as const;

type CardCopy = {
  url: string;
  tableLabel: string;
  brand: string;
  caption: string;
  notForPrint: string | null;
};

export async function createQrDataUrl(url: string, width = 320): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "Q",
    margin: 2,
    width,
    color: { dark: "#1c1917", light: "#ffffff" },
  });
}

export async function renderQrCardPng(copy: CardCopy): Promise<Blob> {
  await document.fonts.load("600 72px 'Cormorant Garamond'");
  await document.fonts.load("600 28px Manrope");
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the QR card");
  context.fillStyle = "#fffdf9";
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  context.textAlign = "center";
  context.fillStyle = "#721f2a";
  context.font = "600 32px Manrope, sans-serif";
  context.fillText(copy.brand, CARD_WIDTH / 2, 88);
  context.fillStyle = "#1c1917";
  context.font = "600 68px 'Cormorant Garamond', serif";
  context.fillText(copy.tableLabel, CARD_WIDTH / 2, 176);
  const qr = await loadImage(await createQrDataUrl(copy.url, 720));
  const qrSize = 640;
  context.drawImage(qr, (CARD_WIDTH - qrSize) / 2, 230, qrSize, qrSize);
  context.fillStyle = "#746c64";
  context.font = "600 26px Manrope, sans-serif";
  drawWrapped(context, copy.caption, CARD_WIDTH / 2, 960, 740, 36);
  if (copy.notForPrint) {
    context.fillStyle = "#721f2a";
    context.fillRect(0, CARD_HEIGHT - 96, CARD_WIDTH, 96);
    context.fillStyle = "#fffdf9";
    context.font = "700 30px Manrope, sans-serif";
    context.fillText(copy.notForPrint, CARD_WIDTH / 2, CARD_HEIGHT - 38);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not prepare the QR card");
  return blob;
}

export async function renderQrSvg(copy: CardCopy): Promise<string> {
  const raw = await QRCode.toString(copy.url, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 2,
    color: { dark: "#1c1917", light: "#ffffff" },
  });
  const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 45 45";
  const inner = raw.replace(/<\?xml[^?]*\?>/g, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const banner = copy.notForPrint
    ? `<rect y="1104" width="900" height="96" fill="#721f2a"/><text x="450" y="1162" text-anchor="middle" font-family="Manrope, sans-serif" font-size="30" fill="#fffdf9">${escapeXml(copy.notForPrint)}</text>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <rect width="900" height="1200" fill="#fffdf9"/>
  <text x="450" y="88" text-anchor="middle" font-family="Manrope, sans-serif" font-size="32" fill="#721f2a">${escapeXml(copy.brand)}</text>
  <text x="450" y="176" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="68" fill="#1c1917">${escapeXml(copy.tableLabel)}</text>
  <svg x="130" y="230" width="640" height="640" viewBox="${viewBox}">${inner}</svg>
  <text x="450" y="960" text-anchor="middle" font-family="Manrope, sans-serif" font-size="26" fill="#746c64">${escapeXml(copy.caption)}</text>
  ${banner}
</svg>`;
}

export async function buildQrPdf(blobs: Blob[]): Promise<Blob> {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const margin = 12;
  const gap = 6;
  const columns = 2;
  const rows = 2;
  const cellWidth = (210 - margin * 2 - gap) / columns;
  const cellHeight = (297 - margin * 2 - gap) / rows;
  const aspect = CARD_WIDTH / CARD_HEIGHT;

  for (const [index, blob] of blobs.entries()) {
    const slot = index % (columns * rows);
    if (index > 0 && slot === 0) pdf.addPage();
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    let drawWidth = cellWidth - 2;
    let drawHeight = drawWidth / aspect;
    if (drawHeight > cellHeight - 2) {
      drawHeight = cellHeight - 2;
      drawWidth = drawHeight * aspect;
    }
    const cellX = margin + column * (cellWidth + gap);
    const cellY = margin + row * (cellHeight + gap);
    const dataUrl = await blobToDataUrl(blob);
    pdf.addImage(dataUrl, "PNG", cellX + (cellWidth - drawWidth) / 2, cellY + (cellHeight - drawHeight) / 2, drawWidth, drawHeight);
  }

  return pdf.output("blob");
}

export async function buildQrZip(files: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) zip.file(file.name, file.blob);
  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadText(contents: string, filename: string, type: string): void {
  downloadBlob(new Blob([contents], { type }), filename);
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&apos;";
  });
}

function drawWrapped(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
  const words = text.split(/\s+/);
  let line = "";
  let offset = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      context.fillText(line, x, y + offset);
      line = word;
      offset += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) context.fillText(line, x, y + offset);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not prepare the QR card"));
    image.src = src;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not prepare the QR sheet"));
    reader.readAsDataURL(blob);
  });
}
