"use client";

import { useEffect, useRef, useState } from "react";
import { audioUrl, clock } from "./api";

/** Play / pause bar for one recording. The link is fetched only when someone taps play. */
export function AudioBar({ path, seconds, title }: { path: string; seconds: number; title?: string | null }) {
  const el = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(seconds);
  const [err, setErr] = useState("");

  useEffect(() => () => el.current?.pause(), []);

  async function toggle() {
    setErr("");
    let a = el.current;
    if (!a) {
      setBusy(true);
      try {
        a = new Audio(await audioUrl(path));
      } catch {
        setBusy(false);
        return setErr("Could not open this recording.");
      }
      a.preload = "auto";
      a.onloadedmetadata = () => Number.isFinite(a!.duration) && a!.duration > 0 && setDur(Math.round(a!.duration));
      a.ontimeupdate = () => setPos(a!.currentTime);
      a.onended = () => {
        setPlaying(false);
        setPos(0);
      };
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
      a.onerror = () => {
        setPlaying(false);
        setErr("This recording could not be played.");
      };
      el.current = a;
      setLoaded(true);
      setBusy(false);
    }
    if (a.paused) await a.play().catch(() => setErr("This recording could not be played."));
    else a.pause();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 rounded-full bg-amber-50 px-2 py-1 dark:bg-amber-950/40">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-label={playing ? "Pause" : title ? `Play ${title}` : "Play voice story"}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-xl text-white disabled:opacity-60"
        >
          {busy ? "…" : playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          aria-label="Position"
          min={0}
          max={Math.max(1, dur)}
          step={0.1}
          value={Math.min(pos, dur)}
          onChange={(e) => {
            if (el.current) el.current.currentTime = Number(e.target.value);
            setPos(Number(e.target.value));
          }}
          disabled={!loaded}
          className="h-8 min-w-0 flex-1 accent-[var(--color-brand,#b45309)]"
        />
        <span className="shrink-0 pr-2 text-xs tabular-nums opacity-70">{clock(pos)} / {clock(dur)}</span>
      </div>
      {err && <p role="alert" className="px-3 text-xs text-red-700 dark:text-red-400">{err}</p>}
    </div>
  );
}
