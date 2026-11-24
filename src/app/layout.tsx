import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NativeBridge } from "@/shared/ui/NativeBridge";
import { Toaster } from "@/shared/ui/Toast";
import { AppLockGate } from "@/shared/ui/AppLockGate";

export const metadata: Metadata = {
  title: "Nammoor",
  description: "Your family tree, relatives and functions in one place.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#b45309",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Before anything is drawn: if App Lock is on, keep the page hidden until it is unlocked. */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('nammoor.appLock')==='1'&&window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())document.documentElement.dataset.locked='1'}catch(e){}" }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AppLockGate />
        <NativeBridge />
        <Toaster />
        {children}
      </body>
    </html>
  );
}
