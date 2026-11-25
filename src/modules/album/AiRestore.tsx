"use client";

import { useEffect, useState } from "react";
import { toast } from "@/shared/ui/Toast";
import { aiRestore, aiStatus, type AiStatus } from "./api";

/**
 * Optional AI restore. If the server has no key (or the function is not deployed) this shows a quiet
 * "Coming soon" note. No errors, no red text.
 */
export function AiRestoreButton({ familyId, photoId, onDone }: { familyId: string; photoId: string; onDone: (newPhotoId: string) => void }) {
  const [st, setSt] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    aiStatus(familyId).then((s) => alive && setSt(s));
    return () => {
      alive = false;
    };
  }, [familyId]);

  if (!st) return null;
  if (st.state === "unavailable")
    return <p className="rounded-xl bg-black/5 p-3 text-center text-sm opacity-80 dark:bg-white/10">✨ AI photo restore · Coming soon</p>;

  async function go() {
    if (!window.confirm("This sends the photo to our AI partner (Replicate) to repair and sharpen it. Continue?")) return;
    setBusy(true);
    setNote("");
    const r = await aiRestore(photoId);
    setBusy(false);
    if (r.ok) {
      setSt({ state: "ready", remaining: r.remaining });
      toast("Restored photo added ✓");
      return onDone(r.photoId);
    }
    if (r.reason === "daily_limit") {
      setSt({ state: "ready", remaining: 0 });
      return setNote("Your family used all 3 AI restores for today. Try again tomorrow.");
    }
    setNote("The AI restore did not work this time. Nothing was used up. Please try again later.");
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={go} disabled={busy || st.remaining <= 0} className="min-h-12 rounded-xl border border-brand px-4 font-medium text-brand disabled:opacity-50">
        {busy ? "Restoring… this can take a minute" : "✨ Restore with AI"}
      </button>
      <p className="text-center text-xs opacity-60">{st.remaining} of 3 left for your family today. Your original stays safe.</p>
      {note && <p role="status" className="text-center text-sm">{note}</p>}
    </div>
  );
}
