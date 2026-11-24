import type { CapacitorConfig } from "@capacitor/cli";

// appId can NOT change after the first Play Store upload. Decide before launch.
const config: CapacitorConfig = {
  appId: "com.nammoor.app",
  appName: "Nammoor",
  webDir: "out",
  android: {
    // Keep the WebView lean on low-RAM phones.
    webContentsDebuggingEnabled: false,
  },
};

export default config;
