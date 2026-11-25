import { enhancePixels, ONE_TAP } from "./enhance";

const MAX_SIDE = 1600;

async function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  const webp = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", 0.85));
  if (webp && webp.type === "image/webp") return webp;
  const jpg = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
  if (!jpg) throw new Error("Could not read this photo");
  return jpg;
}

/** Shrink a camera photo (4 MB+) to a size that is quick on a budget phone. */
export async function loadPhoto(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

/** One-tap clean up: contrast, sharpen, warm. Returns a new canvas, the original is untouched. */
export function enhanceCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  const img = src.getContext("2d")!.getImageData(0, 0, src.width, src.height);
  const px = enhancePixels(img.data, src.width, src.height, ONE_TAP);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(px), src.width, src.height), 0, 0);
  return out;
}

export const canvasToBlob = toBlob;
