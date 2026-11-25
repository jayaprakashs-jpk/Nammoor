// Voice recorder. One small state machine over two back ends:
//   phone  -> @capgo/capacitor-audio-recorder, written as AAC frames (ADTS) so a crash keeps the audio so far
//   web    -> the browser's MediaRecorder
// The 3 minute limit and the "too short" rule live here, so both back ends behave the same.

export const MAX_SECONDS = 180;
export const MIN_SECONDS = 1;

export interface Clip {
  blob: Blob;
  /** Base mime type, no codec part (storage compares this). */
  mime: "audio/aac" | "audio/mp4" | "audio/webm" | "audio/ogg";
  ext: "aac" | "m4a" | "webm" | "ogg";
  seconds: number;
}

export interface Backend {
  start(): Promise<void>;
  stop(): Promise<{ blob: Blob; mime: string; ms: number }>;
  cancel(): Promise<void>;
}

export type RecState = "idle" | "recording" | "stopping";

export class VoiceError extends Error {
  constructor(public code: "denied" | "unsupported" | "short" | "failed", message: string) {
    super(message);
  }
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}
const realClock: Clock = { now: () => Date.now(), setTimeout: (f, m) => window.setTimeout(f, m), clearTimeout: (h) => window.clearTimeout(h as number) };

export function clipFrom(blob: Blob, mime: string, ms: number): Clip {
  const m = mime.toLowerCase();
  const seconds = Math.min(MAX_SECONDS, Math.max(0, Math.round(ms / 1000)));
  if (m.includes("aac")) return { blob, mime: "audio/aac", ext: "aac", seconds };
  if (m.includes("mp4") || m.includes("m4a")) return { blob, mime: "audio/mp4", ext: "m4a", seconds };
  if (m.includes("ogg")) return { blob, mime: "audio/ogg", ext: "ogg", seconds };
  return { blob, mime: "audio/webm", ext: "webm", seconds };
}

export class Recorder {
  state: RecState = "idle";
  private startedAt = 0;
  private timer: unknown = null;
  private pending: Promise<Clip> | null = null;

  constructor(
    private be: Backend,
    private clock: Clock = realClock,
    /** Called when the 3 minute limit stops the recording. The clip comes with it. */
    private onLimit?: (clip: Promise<Clip>) => void,
  ) {}

  /** Seconds recorded so far (for the screen). */
  elapsed(): number {
    return this.state === "recording" ? Math.min(MAX_SECONDS, (this.clock.now() - this.startedAt) / 1000) : 0;
  }

  async start(): Promise<void> {
    if (this.state !== "idle") return;
    await this.be.start(); // throws VoiceError when the mic is not allowed
    this.state = "recording";
    this.startedAt = this.clock.now();
    this.timer = this.clock.setTimeout(() => {
      if (this.state !== "recording") return;
      const p = this.stop();
      p.catch(() => undefined);
      this.onLimit?.(p);
    }, MAX_SECONDS * 1000);
  }

  stop(): Promise<Clip> {
    if (this.pending) return this.pending;
    if (this.state !== "recording") return Promise.reject(new VoiceError("failed", "Not recording"));
    this.state = "stopping";
    this.clock.clearTimeout(this.timer);
    const wall = this.clock.now() - this.startedAt;
    this.pending = this.be
      .stop()
      .then((r) => {
        // trust the shorter of what the recorder says and the wall clock: never above the limit
        const ms = Math.min(r.ms > 0 ? r.ms : wall, wall + 1500, MAX_SECONDS * 1000);
        if (ms < MIN_SECONDS * 1000) throw new VoiceError("short", "That was too short. Hold on a little longer.");
        if (!r.blob.size) throw new VoiceError("failed", "Nothing was recorded");
        return clipFrom(r.blob, r.mime, ms);
      })
      .finally(() => {
        this.state = "idle";
        this.pending = null;
      });
    return this.pending;
  }

  async cancel(): Promise<void> {
    if (this.state === "idle") return;
    this.clock.clearTimeout(this.timer);
    this.state = "idle";
    this.pending = null;
    try {
      await this.be.cancel();
    } catch {
      /* already stopped */
    }
  }
}

// ---------------------------------------------------------------------------
// Back ends. Not unit tested (they need a phone or a microphone); the state
// machine above is. See the e2e test for the browser one with a fake mic.
// ---------------------------------------------------------------------------

export async function nativeBackend(): Promise<Backend> {
  const { CapacitorAudioRecorder } = await import("@capgo/capacitor-audio-recorder");
  const { Capacitor } = await import("@capacitor/core");
  return {
    async start() {
      let p = await CapacitorAudioRecorder.checkPermissions();
      if (p.recordAudio !== "granted") p = await CapacitorAudioRecorder.requestPermissions();
      if (p.recordAudio !== "granted") throw new VoiceError("denied", "Allow the microphone in your phone settings to record stories.");
      // aac = frames that can be played even if the phone dies mid-recording
      await CapacitorAudioRecorder.startRecording({ format: "aac", sampleRate: 22050, bitRate: 48000 });
    },
    async stop() {
      const r = await CapacitorAudioRecorder.stopRecording();
      if (!r.uri) throw new VoiceError("failed", "Nothing was recorded");
      const res = await fetch(Capacitor.convertFileSrc(r.uri));
      const blob = await res.blob();
      return { blob, mime: "audio/aac", ms: r.duration ?? 0 };
    },
    async cancel() {
      await CapacitorAudioRecorder.cancelRecording();
    },
  };
}

const WEB_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export function webBackend(): Backend {
  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let t0 = 0;
  const release = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };
  return {
    async start() {
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new VoiceError("unsupported", "This browser cannot record audio.");
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        throw new VoiceError("denied", "Allow the microphone to record stories.");
      }
      const type = WEB_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 48000 });
      chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(1000);
      t0 = Date.now();
    },
    stop() {
      return new Promise((resolve, reject) => {
        if (!rec) return reject(new VoiceError("failed", "Not recording"));
        const r = rec;
        r.onstop = () => {
          release();
          const mime = r.mimeType || "audio/webm";
          resolve({ blob: new Blob(chunks, { type: mime }), mime, ms: Date.now() - t0 });
        };
        r.onerror = () => {
          release();
          reject(new VoiceError("failed", "Recording failed"));
        };
        r.stop();
      });
    },
    async cancel() {
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      release();
    },
  };
}

export async function makeRecorder(native: boolean, onLimit?: (clip: Promise<Clip>) => void): Promise<Recorder> {
  return new Recorder(native ? await nativeBackend() : webBackend(), realClock, onLimit);
}
