import { describe, expect, it, vi } from "vitest";
import { MAX_SECONDS, Recorder, VoiceError, clipFrom, type Backend, type Clock } from "./recorder";

function fake() {
  let t = 0;
  const timers: { at: number; fn: () => void; id: number; off?: boolean }[] = [];
  const clock: Clock = {
    now: () => t,
    setTimeout: (fn, ms) => { const o = { at: t + ms, fn, id: timers.length }; timers.push(o); return o; },
    clearTimeout: (h) => { if (h) (h as { off?: boolean }).off = true; },
  };
  const advance = (ms: number) => { t += ms; for (const o of timers) if (!o.off && o.at <= t) { o.off = true; o.fn(); } };
  const be: Backend & { stops: number; cancels: number } = {
    stops: 0, cancels: 0,
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => { be.stops++; return { blob: new Blob([new Uint8Array(500)]), mime: "audio/aac", ms: t }; }),
    cancel: vi.fn(async () => { be.cancels++; }),
  };
  return { clock, advance, be };
}

describe("clipFrom", () => {
  it("names the type and extension", () => {
    expect(clipFrom(new Blob(["x"]), "audio/aac", 5000)).toMatchObject({ mime: "audio/aac", ext: "aac", seconds: 5 });
    expect(clipFrom(new Blob(["x"]), "audio/mp4", 5000)).toMatchObject({ mime: "audio/mp4", ext: "m4a" });
    expect(clipFrom(new Blob(["x"]), "audio/webm;codecs=opus", 5000)).toMatchObject({ mime: "audio/webm", ext: "webm" });
    expect(clipFrom(new Blob(["x"]), "audio/ogg;codecs=opus", 5000)).toMatchObject({ mime: "audio/ogg", ext: "ogg" });
  });
  it("never reports more than 3 minutes", () => expect(clipFrom(new Blob(["x"]), "audio/aac", 999_000).seconds).toBe(MAX_SECONDS));
});

describe("Recorder", () => {
  it("records and stops with the right length", async () => {
    const { clock, advance, be } = fake();
    const r = new Recorder(be, clock);
    await r.start();
    expect(r.state).toBe("recording");
    advance(12_400);
    expect(Math.round(r.elapsed())).toBe(12);
    const clip = await r.stop();
    expect(clip.seconds).toBe(12);
    expect(r.state).toBe("idle");
  });
  it("stops by itself at 3 minutes and hands over the clip", async () => {
    const { clock, advance, be } = fake();
    const onLimit = vi.fn();
    const r = new Recorder(be, clock, onLimit);
    await r.start();
    advance(MAX_SECONDS * 1000 - 1);
    expect(onLimit).not.toHaveBeenCalled();
    advance(2);
    expect(onLimit).toHaveBeenCalledTimes(1);
    const clip = await onLimit.mock.calls[0][0];
    expect(clip.seconds).toBe(MAX_SECONDS);
    expect(be.stops).toBe(1);
  });
  it("a recorder that over-reports its length is clamped", async () => {
    const { clock, advance, be } = fake();
    be.stop = vi.fn(async () => ({ blob: new Blob([new Uint8Array(9)]), mime: "audio/aac", ms: 900_000 }));
    const r = new Recorder(be, clock);
    await r.start();
    advance(20_000);
    expect((await r.stop()).seconds).toBeLessThanOrEqual(22);
  });
  it("refuses a clip under one second", async () => {
    const { clock, advance, be } = fake();
    be.stop = vi.fn(async () => ({ blob: new Blob([new Uint8Array(9)]), mime: "audio/aac", ms: 300 }));
    const r = new Recorder(be, clock);
    await r.start();
    advance(300);
    await expect(r.stop()).rejects.toMatchObject({ code: "short" });
    expect(r.state).toBe("idle");
  });
  it("refuses an empty file", async () => {
    const { clock, advance, be } = fake();
    be.stop = vi.fn(async () => ({ blob: new Blob([]), mime: "audio/aac", ms: 5000 }));
    const r = new Recorder(be, clock);
    await r.start();
    advance(5000);
    await expect(r.stop()).rejects.toMatchObject({ code: "failed" });
  });
  it("a second stop call shares the first result, the recorder stops once", async () => {
    const { clock, advance, be } = fake();
    const r = new Recorder(be, clock);
    await r.start();
    advance(5000);
    const [a, b] = await Promise.all([r.stop(), r.stop()]);
    expect(a).toBe(b);
    expect(be.stops).toBe(1);
  });
  it("a denied microphone leaves the recorder idle", async () => {
    const { clock, be } = fake();
    be.start = vi.fn(async () => { throw new VoiceError("denied", "no"); });
    const r = new Recorder(be, clock);
    await expect(r.start()).rejects.toMatchObject({ code: "denied" });
    expect(r.state).toBe("idle");
  });
  it("cancel drops the audio and cancels the timer", async () => {
    const { clock, advance, be } = fake();
    const onLimit = vi.fn();
    const r = new Recorder(be, clock, onLimit);
    await r.start();
    await r.cancel();
    advance(MAX_SECONDS * 1000 + 5);
    expect(onLimit).not.toHaveBeenCalled();
    expect(be.cancels).toBe(1);
    expect(r.state).toBe("idle");
  });
  it("can record again after a stop", async () => {
    const { clock, advance, be } = fake();
    const r = new Recorder(be, clock);
    await r.start(); advance(3000); await r.stop();
    await r.start(); advance(3000);
    expect((await r.stop()).seconds).toBeGreaterThanOrEqual(3);
  });
  it("stop without start fails clearly", async () => {
    const { clock, be } = fake();
    await expect(new Recorder(be, clock).stop()).rejects.toBeInstanceOf(VoiceError);
  });
});
