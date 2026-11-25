import type { Cmd, Measure, PageCmds } from "./commands";
import { buildPdf, type PdfPage } from "./pdf";

// The browser paints each page (so Tamil letters are shaped correctly), then the page becomes a JPEG in the PDF.

const FONT = `"Noto Sans Tamil", "Noto Sans", "Latha", system-ui, sans-serif`;
const font = (size: number, bold?: boolean) => `${bold ? "700" : "400"} ${size}px ${FONT}`;

let ruler: CanvasRenderingContext2D | null = null;
/** Real text width in points, measured by the browser. */
export const browserMeasure: Measure = (text, size, bold) => {
  ruler ??= document.createElement("canvas").getContext("2d")!;
  ruler.font = font(size * 10, bold); // measure big to avoid rounding at small sizes
  return ruler.measureText(text).width / 10;
};

export type Images = Map<string, ImageBitmap>;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function draw(ctx: CanvasRenderingContext2D, c: Cmd, images: Images) {
  if (c.t === "rect") {
    if (c.r) roundRect(ctx, c.x, c.y, c.w, c.h, c.r);
    else {
      ctx.beginPath();
      ctx.rect(c.x, c.y, c.w, c.h);
    }
    if (c.fill) {
      ctx.fillStyle = c.fill;
      ctx.fill();
    }
    if (c.stroke) {
      ctx.strokeStyle = c.stroke;
      ctx.lineWidth = c.lw ?? 1;
      ctx.stroke();
    }
  } else if (c.t === "line") {
    ctx.beginPath();
    ctx.moveTo(c.x1, c.y1);
    ctx.lineTo(c.x2, c.y2);
    ctx.strokeStyle = c.color;
    ctx.lineWidth = c.lw;
    ctx.lineCap = "round";
    ctx.stroke();
  } else if (c.t === "text") {
    ctx.font = font(c.size, c.bold);
    ctx.fillStyle = c.color;
    ctx.textAlign = c.align ?? "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(c.s, c.x, c.y);
  } else {
    const img = images.get(c.ref);
    if (!img) return;
    // fill the box, keep the shape (crop the overflow)
    const s = Math.max(c.w / img.width, c.h / img.height);
    const sw = c.w / s;
    const sh = c.h / s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(c.x, c.y, c.w, c.h);
    ctx.clip();
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, c.x, c.y, c.w, c.h);
    ctx.restore();
  }
}

export function paint(page: PageCmds, images: Images, pxPerPt: number, into?: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = into ?? document.createElement("canvas");
  canvas.width = Math.round(page.w * pxPerPt);
  canvas.height = Math.round(page.h * pxPerPt);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(pxPerPt, 0, 0, pxPerPt, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, page.w, page.h);
  for (const c of page.cmds) draw(ctx, c, images);
  return canvas;
}

async function jpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("Could not draw the page");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Paint every page and write the PDF. One page at a time, so a big book does not fill the phone's memory. */
export async function makePdf(pages: PageCmds[], images: Images, pxPerPt: number, title: string, onPage?: (done: number, total: number) => void): Promise<Uint8Array> {
  const out: PdfPage[] = [];
  for (let i = 0; i < pages.length; i++) {
    const canvas = paint(pages[i], images, pxPerPt);
    out.push({ w: pages[i].w, h: pages[i].h, jpeg: await jpeg(canvas), pxW: canvas.width, pxH: canvas.height });
    canvas.width = canvas.height = 0; // let go of the memory
    onPage?.(i + 1, pages.length);
    await new Promise((r) => setTimeout(r, 0)); // let the screen breathe
  }
  return buildPdf(out, title);
}
