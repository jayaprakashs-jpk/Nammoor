"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp } from "@/shared/lib/platform";
import { toast } from "@/shared/ui/Toast";

// Runs only inside the Android app. Listens for the link Google sends people back to.
// On the website this renders nothing and loads nothing.
export function NativeBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;
    let remove: (() => void) | undefined;
    let gone = false;

    (async () => {
      const [{ App }, { isAuthCallback, finishGoogleLogin }] = await Promise.all([import("@capacitor/app"), import("@/modules/auth/google")]);
      const handle = async (url: string) => {
        if (!isAuthCallback(url)) return;
        try {
          const { Browser } = await import("@capacitor/browser");
          await Browser.close(); // no-op on Android, closes the tab elsewhere
        } catch {
          /* fine */
        }
        const r = await finishGoogleLogin(url);
        if ("error" in r) toast(`Google sign in failed. ${r.error}`, "error");
        else router.replace(r.next);
      };
      const sub = await App.addListener("appUrlOpen", (e) => void handle(e.url));
      remove = () => void sub.remove();
      if (gone) return remove();
      // the app may have been started by the link itself
      const launch = await App.getLaunchUrl();
      if (launch?.url) void handle(launch.url);
    })();

    return () => {
      gone = true;
      remove?.();
    };
  }, [router]);

  return null;
}
