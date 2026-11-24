import { Capacitor } from "@capacitor/core";

/** True inside the Android APK, false on the website. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();
