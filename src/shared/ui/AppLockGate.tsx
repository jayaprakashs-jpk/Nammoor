"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp } from "@/shared/lib/platform";
import { authenticate, clearLock, LOCK_EVENT, lockEnabled, outcomeMessage, shouldLock } from "@/shared/lib/appLock";

// Full-screen lock. Only exists in the Android app, and only when App Lock is switched on.
export function AppLockGate() {
  const router = useRouter();
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");
  const asking = useRef(false);
  const away = useRef<number | null>(null);

  // hide the page behind the lock the instant it is locked (and unhide it when it is not)
  useEffect(() => {
    document.documentElement.dataset.locked = locked ? "1" : "0";
  }, [locked]);

  const unlock = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    setMessage("");
    const r = await authenticate("Unlock Nammoor");
    asking.current = false;
    away.current = null; // coming back from the phone's own sheet is not "being away"
    if (r === "ok") setLocked(false);
    else if (r === "not_set_up") {
      // the phone's screen lock was removed: do not trap people out of their own tree
      setMessage(outcomeMessage.not_set_up);
    } else if (r !== "cancelled") setMessage(outcomeMessage[r]);
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    let off: (() => void) | undefined;
    let gone = false;
    // The page is already hidden by the script in <head>, so this can wait one tick.
    const start = window.setTimeout(() => {
      if (lockEnabled()) {
        setLocked(true);
        void unlock();
      }
    }, 0);
    (async () => {
      const { App } = await import("@capacitor/app");
      const sub = await App.addListener("appStateChange", ({ isActive }) => {
        if (asking.current) return;
        if (!isActive) away.current = Date.now();
        else {
          const since = away.current === null ? 0 : Date.now() - away.current;
          away.current = null;
          if (shouldLock(lockEnabled(), since)) {
            setLocked(true);
            void unlock();
          }
        }
      });
      off = () => void sub.remove();
      if (gone) off();
    })();
    return () => {
      window.clearTimeout(start);
      gone = true;
      off?.();
    };
  }, [unlock]);

  // switching the lock off in Security settings (or signing out) removes the screen at once
  useEffect(() => {
    const onChange = () => !lockEnabled() && setLocked(false);
    window.addEventListener(LOCK_EVENT, onChange);
    return () => window.removeEventListener(LOCK_EVENT, onChange);
  }, []);

  async function signOut() {
    const { sb } = await import("@/shared/lib/supabase");
    await sb().auth.signOut();
    clearLock();
    setLocked(false);
    router.replace("/login/");
  }

  if (!locked) return null;
  return (
    <div data-lock-screen className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background p-8 text-center" role="dialog" aria-modal="true" aria-label="Nammoor is locked">
      <span className="text-6xl" aria-hidden>🔒</span>
      <div>
        <h1 className="text-2xl font-bold text-brand">Nammoor is locked</h1>
        <p className="mt-1 text-sm opacity-70">நம்மூர் · Use your fingerprint, face or phone PIN</p>
      </div>
      {message && <p role="alert" className="max-w-xs rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{message}</p>}
      <button type="button" onClick={unlock} className="min-h-14 w-full max-w-xs rounded-lg bg-brand px-6 text-lg font-medium text-white active:scale-[0.98]">Unlock</button>
      <button type="button" onClick={signOut} className="min-h-12 text-sm text-brand underline">Sign out instead</button>
    </div>
  );
}
