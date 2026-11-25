// Free, on-device clean-up for old photos. No upload, no AI, no cost.
// Three steps: stretch the contrast, sharpen a little, add a gentle warm tone.
// Works on raw RGBA pixels so it can be tested without a browser.

export interface EnhanceOptions {
  /** 0 to 1. How much to stretch dull, faded contrast. */
  contrast: number;
  /** 0 to 1. How much to sharpen soft edges. */
  sharpen: number;
  /** 0 to 1. How much warm "restored print" tone to add. */
  warm: number;
}

export const ONE_TAP: EnhanceOptions = { contrast: 1, sharpen: 0.6, warm: 0.5 };

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Brightness at the 1st and 99th percentile, ignoring see-through pixels. */
export function levels(px: Uint8ClampedArray): { lo: number; hi: number } | null {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    hist[Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])]++;
    n++;
  }
  if (!n) return null;
  const cut = Math.max(1, Math.floor(n * 0.01));
  let acc = 0;
  let lo = 0;
  for (; lo < 255; lo++) if ((acc += hist[lo]) > cut) break;
  acc = 0;
  let hi = 255;
  for (; hi > 0; hi--) if ((acc += hist[hi]) > cut) break;
  return { lo, hi };
}

export function enhancePixels(src: Uint8ClampedArray, w: number, h: number, o: EnhanceOptions = ONE_TAP): Uint8ClampedArray {
  if (src.length !== w * h * 4) throw new Error("Pixel data does not match the size");
  const out = new Uint8ClampedArray(src);
  const cs = Math.min(1, Math.max(0, o.contrast));
  const ss = Math.min(1, Math.max(0, o.sharpen));
  const ws = Math.min(1, Math.max(0, o.warm));

  // 1. contrast: stretch the used range to the full range (same stretch for every colour, so colours do not shift)
  const lv = cs > 0 ? levels(src) : null;
  if (lv && lv.hi - lv.lo >= 16 && (lv.lo > 2 || lv.hi < 253)) {
    const scale = 255 / (lv.hi - lv.lo);
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) continue;
      for (let c = 0; c < 3; c++) {
        const stretched = (out[i + c] - lv.lo) * scale;
        out[i + c] = clamp(out[i + c] + (stretched - out[i + c]) * cs);
      }
    }
  }

  // 2. sharpen: unsharp mask. Only edges move; flat areas and tiny noise are left alone.
  if (ss > 0 && w >= 3 && h >= 3) {
    const base = new Uint8ClampedArray(out);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        if (base[i + 3] === 0) continue;
        for (let c = 0; c < 3; c++) {
          const j = i + c;
          const blur = (base[j - 4 - w * 4] + base[j - w * 4] + base[j + 4 - w * 4] + base[j - 4] + base[j] + base[j + 4] + base[j - 4 + w * 4] + base[j + w * 4] + base[j + 4 + w * 4]) / 9;
          const d = base[j] - blur;
          if (d > 3 || d < -3) out[j] = clamp(base[j] + d * ss * 1.4);
        }
      }
    }
  }

  // 3. warm: a touch more red, a touch less blue, a little more colour
  if (ws > 0) {
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] === 0) continue;
      const lum = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
      const sat = 1 + 0.15 * ws;
      let r = lum + (out[i] - lum) * sat;
      const gr = lum + (out[i + 1] - lum) * sat;
      let b = lum + (out[i + 2] - lum) * sat;
      r *= 1 + 0.06 * ws;
      b *= 1 - 0.09 * ws;
      out[i] = clamp(r);
      out[i + 1] = clamp(gr);
      out[i + 2] = clamp(b);
    }
  }
  return out;
}
