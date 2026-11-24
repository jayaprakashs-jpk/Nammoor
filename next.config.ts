import type { NextConfig } from "next";

// Static export: the same `out/` folder is the website AND the Android app
// (Capacitor copies it into the APK). So: no server code, no API routes,
// no server actions, no middleware. All security is in Supabase RLS.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true, // /tree -> /tree/index.html, works from the APK file system
  images: { unoptimized: true },
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
