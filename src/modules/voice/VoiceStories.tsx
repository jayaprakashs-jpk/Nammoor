"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { friendlyError } from "@/shared/lib/errors";
import { isNativeApp } from "@/shared/lib/platform";
import { Button, ErrorText, Input } from "@/shared/ui/form";
import { toast } from "@/shared/ui/Toast";
import { AudioBar } from "./AudioBar";
import { clock, deleteVoice, listVoice, saveVoice, type VoiceMemo } from "./api";
import { MAX_SECONDS, VoiceError, makeRecorder, type Clip, type Recorder } from "./recorder";

interface Props {
  familyId: string;
  personId: string;
  /** null = stories about the person; a photo id = stories about that photo. */
  photoId: string | null;
  canAdd: boolean;
  userId: string;
  isAdmin: boolean;
  /** Small heading, e.g. "Stories about this photo". */
  heading?: string;
}

export default function VoiceStories({ familyId, personId, photoId, canAdd, userId, isAdmin, heading }: Props) {
  const [all, setAll] = useState<VoiceMemo[] | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "recording" | "review">("idle");
  const [secs, setSecs] = useState(0);
  const [clip, setClip] = useState<Clip | null>(null);
  const [preview, setPreview] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const rec = useRef<Recorder | null>(null);
  const tick = useRef<number | null>(null);

  const load = useCallback(() => {
    listVoice(personId).then(setAll, (e) => setError(friendlyError(e)));
  }, [personId]);
  useEffect(load, [load]);

  const stopTick = () => {
    if (tick.current) window.clearInterval(tick.current);
    tick.current = null;
  };
  useEffect(
    () => () => {
      stopTick();
      rec.current?.cancel();
    },
    [],
  );
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const review = useCallback((c: Clip) => {
    stopTick();
    setClip(c);
    setPreview(URL.createObjectURL(c.blob));
    setPhase("review");
  }, []);

  async function start() {
    setError("");
    try {
      const r = await makeRecorder(isNativeApp(), (p) => p.then(review, (e) => fail(e)));
      rec.current = r;
      await r.start();
      setSecs(0);
      setPhase("recording");
      tick.current = window.setInterval(() => setSecs(Math.floor(r.elapsed())), 250);
    } catch (e) {
      fail(e);
    }
  }

  function fail(e: unknown) {
    stopTick();
    setPhase("idle");
    setError(e instanceof VoiceError ? e.message : friendlyError(e));
  }

  async function stop() {
    try {
      review(await rec.current!.stop());
    } catch (e) {
      fail(e);
    }
  }

  async function cancel() {
    stopTick();
    await rec.current?.cancel();
    discard();
  }

  function discard() {
    setClip(null);
    setPreview("");
    setTitle("");
    setPhase("idle");
  }

  async function save() {
    if (!clip) return;
    setBusy(true);
    setError("");
    try {
      const m = await saveVoice({ familyId, personId, photoId, clip, title });
      setAll((c) => [...(c ?? []), m]);
      discard();
      toast("Voice story saved ✓");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: VoiceMemo) {
    if (!window.confirm("Delete this voice story?")) return;
    try {
      await deleteVoice(m);
      setAll((c) => (c ?? []).filter((x) => x.id !== m.id));
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  const mine = (all ?? []).filter((m) => m.photo_id === photoId);
  if (!canAdd && all && !mine.length) return null;

  return (
    <section aria-label={heading ?? "Voice stories"} className="flex flex-col gap-2">
      {mine.length > 0 && heading && <h3 className="text-sm font-semibold">{heading}</h3>}
      {mine.map((m) => (
        <div key={m.id} className="flex flex-col gap-1">
          <AudioBar path={m.audio_path} seconds={m.duration_sec} title={m.title} />
          <div className="flex items-center justify-between px-3 text-xs opacity-70">
            <span>{m.title || "Voice story"} · {new Date(m.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
            {(m.author_id === userId || isAdmin) && (
              <button type="button" onClick={() => remove(m)} className="min-h-10 px-2 font-medium text-red-700 dark:text-red-400">Delete</button>
            )}
          </div>
        </div>
      ))}

      <ErrorText>{error}</ErrorText>

      {canAdd && phase === "idle" && (
        <Button type="button" variant="secondary" onClick={start}>🎙️ {mine.length ? "Add another story" : "Record a voice story"}</Button>
      )}
      {phase === "recording" && (
        <div className="flex flex-col gap-2 rounded-2xl border border-red-300 p-3 dark:border-red-800" role="status" aria-live="polite">
          <p className="flex items-center gap-2 font-semibold">
            <span aria-hidden className="size-3 animate-pulse rounded-full bg-red-600" /> Recording {clock(secs)} <span className="text-xs font-normal opacity-60">of {clock(MAX_SECONDS)}</span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={cancel} className="flex-1">Cancel</Button>
            <Button type="button" onClick={stop} className="flex-1">Stop</Button>
          </div>
        </div>
      )}
      {phase === "review" && clip && (
        <div className="flex flex-col gap-2 rounded-2xl border border-black/15 p-3 dark:border-white/20">
          <p className="text-sm font-medium">Listen, then save ({clock(clip.seconds)})</p>
          <audio controls src={preview} className="w-full" />
          <Input aria-label="Title (optional)" placeholder="Title (optional)" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={discard} className="flex-1">Discard</Button>
            <Button type="button" onClick={save} busy={busy} className="flex-1">Save story</Button>
          </div>
        </div>
      )}
    </section>
  );
}
