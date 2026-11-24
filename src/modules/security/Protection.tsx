"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/shared/lib/supabase";
import { authenticate, clearLock, lockEnabled, lockSupported, outcomeMessage, setLockEnabled } from "@/shared/lib/appLock";
import { Button, ErrorText, Section } from "@/shared/ui/form";
import { toast } from "@/shared/ui/Toast";
import { signOutOthers } from "@/modules/auth/flows";

export function Protection() {
  const router = useRouter();
  const [lock, setLock] = useState(lockEnabled);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const native = lockSupported();

  async function toggleLock() {
    setError("");
    setBusy("lock");
    // switching on or off both need your fingerprint or PIN, so nobody else can change it
    const r = await authenticate(lock ? "Turn App Lock off" : "Turn App Lock on");
    setBusy("");
    if (r === "ok") {
      setLockEnabled(!lock);
      setLock(!lock);
      toast(lock ? "App Lock is off" : "App Lock is on ✓");
    } else if (r !== "cancelled") setError(outcomeMessage[r]);
  }

  async function others() {
    if (!window.confirm("Sign out of all your other phones and computers? This phone stays signed in.")) return;
    setError("");
    setBusy("others");
    const r = await signOutOthers();
    setBusy("");
    if (r.ok) toast("Signed out everywhere else ✓");
    else setError(r.message);
  }

  async function out() {
    if (!window.confirm("Sign out of Nammoor on this phone?")) return;
    await sb().auth.signOut();
    clearLock();
    router.replace("/login/");
  }

  return (
    <>
      <Section title="App Lock">
        {native ? (
          <>
            <p className="text-sm">Ask for your fingerprint, face or phone PIN when Nammoor opens, or when you come back after being away.</p>
            <label className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-black/15 px-4 dark:border-white/20">
              <span className="font-medium">{lock ? "App Lock is ON" : "App Lock is off"}</span>
              <button type="button" role="switch" aria-checked={lock} aria-label="App Lock" onClick={toggleLock} disabled={busy === "lock"}
                className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${lock ? "bg-brand" : "bg-stone-400"} disabled:opacity-50`}>
                <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${lock ? "left-7" : "left-1"}`} />
              </button>
            </label>
            <p className="text-xs opacity-70">This is a lock for this phone only. It needs a screen lock (PIN, pattern, fingerprint or face) set up in your phone Settings.</p>
          </>
        ) : (
          <p className="text-sm opacity-80">App Lock is available in the Nammoor Android app.</p>
        )}
        <ErrorText>{error}</ErrorText>
      </Section>

      <Section title="Devices">
        <p className="text-sm">Lost a phone, or used a friend&apos;s computer? Sign out everywhere except here.</p>
        <Button variant="secondary" onClick={others} busy={busy === "others"}>Log out of all other devices</Button>
        <p className="text-xs opacity-70">Other devices can take up to an hour to notice.</p>
        <Button variant="danger" onClick={out}>Sign out of this phone</Button>
      </Section>
    </>
  );
}
