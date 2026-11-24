import { isNativeApp } from "@/shared/lib/platform";

export interface SaveResult {
  /** How it was handled, for the confirmation message. */
  how: "shared" | "downloaded" | "cancelled";
}

/**
 * Save a text file. In the Android app this opens the phone's Share sheet (save to Files,
 * Google Drive, WhatsApp...). On the website it downloads the file.
 */
export async function saveTextFile(name: string, mime: string, content: string): Promise<SaveResult> {
  if (isNativeApp()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    try {
      await Share.share({ title: name, text: "Nammoor family backup", url: uri, dialogTitle: "Save your family backup" });
      return { how: "shared" };
    } catch (e) {
      // closing the sheet counts as an error on some phones
      if (/cancel/i.test(String((e as Error)?.message))) return { how: "cancelled" };
      throw e;
    }
  }
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { how: "downloaded" };
}

/** Plain ASCII file name from a family name (Tamil names become "family"). */
export function backupFileName(familyName: string, ext: "json" | "ged", today: Date = new Date()): string {
  const slug = familyName.normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "family";
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return `nammoor-${slug}-${d}.${ext}`;
}
