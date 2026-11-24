"use client";

import { useEffect, useState } from "react";
import { sb } from "@/shared/lib/supabase";

// Signed URLs last 1 hour. Cache them so scrolling doesn't refetch.
const cache = new Map<string, { url: string; until: number }>();

export async function signedPhotoUrls(paths: string[]): Promise<void> {
  const need = paths.filter((p) => (cache.get(p)?.until ?? 0) <= Date.now());
  if (!need.length) return;
  const { data } = await sb().storage.from("person-photos").createSignedUrls(need, 3600);
  for (const d of data ?? []) {
    if (d.signedUrl && d.path) cache.set(d.path, { url: d.signedUrl, until: Date.now() + 3500_000 });
  }
}

export function Avatar({ name, path, size = 40 }: { name: string; path: string | null; size?: number }) {
  const [url, setUrl] = useState<string | null>(path ? cache.get(path)?.url ?? null : null);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    signedPhotoUrls([path]).then(() => alive && setUrl(cache.get(path)?.url ?? null));
    return () => {
      alive = false;
    };
  }, [path]);

  const initials = name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100"
      style={{ width: size, height: size, fontSize: size / 2.6 }}
    >
      {url && path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" width={size} height={size} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        initials || "?"
      )}
    </span>
  );
}
