import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NativeBridge } from "@/shared/ui/NativeBridge";
import { Toaster } from "@/shared/ui/Toast";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <NativeBridge />
        <Toaster />
        {children}
      </body>
    </html>
  );
}
