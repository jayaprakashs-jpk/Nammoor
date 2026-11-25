import { describe, expect, it } from "vitest";
import { enhancePixels, levels, ONE_TAP } from "./enhance";

const gray = (w: number, h: number, f: (x: number, y: number) => number, alpha = 255) => {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const v = f(x, y); a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = alpha; }
  return a;
};
const range = (a: Uint8ClampedArray) => { let lo = 255, hi = 0; for (let i = 0; i < a.length; i += 4) { lo = Math.min(lo, a[i + 1]); hi = Math.max(hi, a[i + 1]); } return [lo, hi]; };
const only = (o: Partial<typeof ONE_TAP>) => ({ contrast: 0, sharpen: 0, warm: 0, ...o });

describe("auto-contrast", () => {
  it("stretches a faded photo (80..170) to use the whole range", () => {
    const faded = gray(20, 20, (x) => 80 + Math.round((x / 19) * 90));
    const [lo, hi] = range(enhancePixels(faded, 20, 20, only({ contrast: 1 })));
    expect(lo).toBeLessThan(10);
    expect(hi).toBeGreaterThan(245);
  });
  it("leaves a photo that already uses the full range as it is", () => {
    const full = gray(20, 20, (x) => Math.round((x / 19) * 255));
    expect(Array.from(enhancePixels(full, 20, 20, only({ contrast: 1 })))).toEqual(Array.from(full));
  });
  it("does not blow up a flat picture", () => {
    const flat = gray(10, 10, () => 120);
    expect(Array.from(enhancePixels(flat, 10, 10, only({ contrast: 1 })))).toEqual(Array.from(flat));
  });
  it("one blown-out pixel does not stop the stretch (percentiles, not min/max)", () => {
    const px = gray(30, 30, (x) => 90 + (x % 10) * 6);
    px[0] = px[1] = px[2] = 0; // one black speck
    expect(range(enhancePixels(px, 30, 30, only({ contrast: 1 })))[1]).toBeGreaterThan(235);
  });
  it("strength blends between old and new", () => {
    const faded = gray(20, 20, (x) => 80 + Math.round((x / 19) * 90));
    const half = range(enhancePixels(faded, 20, 20, only({ contrast: 0.5 })));
    expect(half[0]).toBeGreaterThan(20);
    expect(half[0]).toBeLessThan(70);
  });
  it("finds levels, and none for an empty picture", () => {
    expect(levels(gray(5, 5, () => 100))).toEqual({ lo: 100, hi: 100 });
    expect(levels(gray(5, 5, () => 100, 0))).toBeNull();
  });
});

describe("sharpen", () => {
  it("makes a soft edge crisper (dark side darker, light side lighter)", () => {
    const soft = gray(12, 5, (x) => (x < 5 ? 80 : x === 5 ? 110 : x === 6 ? 150 : 180));
    const out = enhancePixels(soft, 12, 5, only({ sharpen: 1 }));
    const at = (x: number) => out[(2 * 12 + x) * 4];
    expect(at(5)).toBeLessThan(110);
    expect(at(6)).toBeGreaterThan(150);
  });
  it("leaves flat areas and faint noise alone", () => {
    const noisy = gray(10, 10, (x, y) => 100 + ((x + y) % 2));
    expect(Array.from(enhancePixels(noisy, 10, 10, only({ sharpen: 1 })))).toEqual(Array.from(noisy));
  });
  it("tiny images are returned unchanged, not crashed on", () => {
    const tiny = gray(2, 2, () => 77);
    expect(Array.from(enhancePixels(tiny, 2, 2, ONE_TAP).slice(0, 3))).toHaveLength(3);
  });
});

describe("warm restore", () => {
  it("adds red and takes away blue, so grey becomes a warm tone", () => {
    const out = enhancePixels(gray(4, 4, () => 128), 4, 4, only({ warm: 1 }));
    expect(out[0]).toBeGreaterThan(128);
    expect(out[2]).toBeLessThan(128);
    expect(out[0]).toBeGreaterThan(out[2]);
  });
  it("is subtle at the default strength", () => {
    const out = enhancePixels(gray(4, 4, () => 128), 4, 4, only({ warm: 0.5 }));
    expect(out[0] - 128).toBeLessThan(12);
    expect(128 - out[2]).toBeLessThan(12);
  });
});

describe("safety", () => {
  it("does not change see-through pixels or the size, and never leaves 0..255", () => {
    const px = gray(8, 8, (x) => x * 30, 0);
    const out = enhancePixels(px, 8, 8, ONE_TAP);
    expect(out.length).toBe(px.length);
    expect(Array.from(out)).toEqual(Array.from(px));
    const wild = enhancePixels(gray(8, 8, (x, y) => ((x * 37 + y * 91) % 2) * 255), 8, 8, { contrast: 1, sharpen: 1, warm: 1 });
    for (const v of wild) expect(v >= 0 && v <= 255).toBe(true);
  });
  it("zero strength gives back the same picture, and the input is never modified", () => {
    const px = gray(10, 10, (x) => 80 + x * 5);
    const copy = new Uint8ClampedArray(px);
    expect(Array.from(enhancePixels(px, 10, 10, only({})))).toEqual(Array.from(px));
    enhancePixels(px, 10, 10, ONE_TAP);
    expect(Array.from(px)).toEqual(Array.from(copy));
  });
  it("is the same every time", () => {
    const px = gray(16, 16, (x, y) => 60 + ((x * 7 + y * 3) % 90));
    expect(Array.from(enhancePixels(px, 16, 16, ONE_TAP))).toEqual(Array.from(enhancePixels(px, 16, 16, ONE_TAP)));
  });
  it("refuses data that does not match the size", () => expect(() => enhancePixels(new Uint8ClampedArray(10), 5, 5)).toThrow());
  it("handles a 1600 x 1200 photo quickly", () => {
    const big = gray(1600, 1200, (x, y) => 60 + ((x + y) % 120));
    const t0 = Date.now();
    enhancePixels(big, 1600, 1200, ONE_TAP);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
