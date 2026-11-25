"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { friendlyError } from "@/shared/lib/errors";
import { Button, ErrorText, Field, Input, Section } from "@/shared/ui/form";
import { toast } from "@/shared/ui/Toast";
import { addAlbumPhoto, albumUrls, deleteAlbumPhoto, listAlbum, type AlbumPhoto } from "./api";
import { canvasToBlob, enhanceCanvas, loadPhoto } from "./image";
import { AiRestoreButton } from "./AiRestore";

const VoiceStories = dynamic(() => import("@/modules/voice/VoiceStories"), { ssr: false });

interface Props {
  familyId: string;
  personId: string;
  userId: string;
  canAdd: boolean;
  isAdmin: boolean;
}

export default function AlbumSection({ familyId, personId, userId, canAdd, isAdmin }: Props) {
  const [photos, setPhotos] = useState<AlbumPhoto[] | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState("");
  const [open, setOpen] = useState<AlbumPhoto | null>(null);
  const [draft, setDraft] = useState<{ orig: HTMLCanvasElement; fixed: HTMLCanvasElement | null } | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      listAlbum(personId)
        .then(async (list) => {
          setPhotos(list);
          setUrls(await albumUrls(list.map((p) => p.path)));
        })
        .catch((e) => setError(friendlyError(e))),
    [personId],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function chosen(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      setDraft({ orig: await loadPhoto(file), fixed: null });
    } catch {
      setError("Could not read this photo. Try a JPG or PNG.");
    }
  }

  const live = open ? photos?.find((p) => p.id === open.id) ?? null : null;

  return (
    <Section title="Photo album">
      <ErrorText>{error}</ErrorText>
      {photos && !photos.length && <p className="text-sm opacity-70">{canAdd ? "No photos yet. Add old family photos and record the story behind each one." : "No photos yet."}</p>}
      <ul className="grid grid-cols-3 gap-2">
        {(photos ?? []).map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(p)} aria-label={p.caption ? `Open photo: ${p.caption}` : "Open photo"} className="relative block aspect-square w-full overflow-hidden rounded-lg bg-black/5 dark:bg-white/10">
              {urls.get(p.path) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls.get(p.path)} alt={p.caption ?? ""} loading="lazy" className="size-full object-cover" />
              )}
              {p.kind === "ai_restored" && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">AI</span>}
            </button>
          </li>
        ))}
      </ul>
      {canAdd && (
        <>
          <input ref={pick} type="file" accept="image/*" hidden aria-label="Choose album photo" onChange={(e) => { chosen(e.target.files?.[0]); e.target.value = ""; }} />
          <Button type="button" variant="secondary" onClick={() => pick.current?.click()}>＋ Add a photo</Button>
        </>
      )}

      {draft && (
        <Dialog label="Add photo" onClose={() => setDraft(null)}>
          <AddPhoto
            draft={draft}
            onToggle={() => setDraft((d) => (d ? { ...d, fixed: d.fixed ? null : enhanceCanvas(d.orig) } : d))}
            onCancel={() => setDraft(null)}
            onSave={async (caption, year) => {
              const canvas = draft.fixed ?? draft.orig;
              const p = await addAlbumPhoto({ familyId, personId, blob: await canvasToBlob(canvas), caption, year });
              setPhotos((c) => [p, ...(c ?? [])]);
              setUrls(await albumUrls([p.path]).then((m) => new Map([...urls, ...m])));
              setDraft(null);
              toast("Photo added ✓");
            }}
          />
        </Dialog>
      )}

      {live && (
        <Dialog label="Photo" onClose={() => setOpen(null)}>
          <Viewer
            photo={live}
            url={urls.get(live.path)}
            familyId={familyId}
            personId={personId}
            userId={userId}
            canAdd={canAdd}
            isAdmin={isAdmin}
            onRestored={async (id) => {
              await load();
              const next = (await listAlbum(personId)).find((x) => x.id === id);
              if (next) setOpen(next);
            }}
            onDelete={async () => {
              if (!window.confirm("Delete this photo and its voice stories?")) return;
              try {
                await deleteAlbumPhoto(live);
                setPhotos((c) => (c ?? []).filter((x) => x.id !== live.id));
                setOpen(null);
              } catch (e) {
                setError(friendlyError(e));
                setOpen(null);
              }
            }}
          />
        </Dialog>
      )}
    </Section>
  );
}

function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4">
        <button type="button" onClick={onClose} className="min-h-12 self-end rounded-lg px-3 font-medium text-brand">Close ✕</button>
        {children}
      </div>
    </div>
  );
}

function CanvasView({ canvas, label }: { canvas: HTMLCanvasElement; label: string }) {
  const url = useMemo(() => canvas.toDataURL("image/jpeg", 0.8), [canvas]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={label} className="max-h-[55vh] w-full rounded-xl object-contain" />;
}

function AddPhoto({ draft, onToggle, onCancel, onSave }: { draft: { orig: HTMLCanvasElement; fixed: HTMLCanvasElement | null }; onToggle: () => void; onCancel: () => void; onSave: (caption: string, year: number | null) => Promise<void> }) {
  const [caption, setCaption] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enhanced = !!draft.fixed;
  const y = year.trim() ? Number(year) : null;
  return (
    <>
      <CanvasView canvas={draft.fixed ?? draft.orig} label={enhanced ? "Cleaned up photo" : "Original photo"} />
      <button type="button" role="switch" aria-checked={enhanced} onClick={onToggle} className={`min-h-12 rounded-xl border px-4 font-medium ${enhanced ? "border-brand bg-brand/10 text-brand" : "border-black/15 dark:border-white/20"}`}>
        ✨ {enhanced ? "Cleaned up. Tap to see the original" : "Clean up this old photo"}
      </button>
      <p className="text-xs opacity-60">Fixes faded contrast, softness and colour. It happens on your phone. Nothing is sent anywhere.</p>
      <Field label="Caption (optional)"><Input value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} placeholder="Wedding at Thanjavur" /></Field>
      <Field label="Year (optional)"><Input inputMode="numeric" value={year} maxLength={4} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} placeholder="1978" /></Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button
          type="button"
          busy={busy}
          className="flex-1"
          onClick={async () => {
            if (y !== null && (y < 1800 || y > new Date().getFullYear())) return setError("Check the year.");
            setBusy(true);
            setError("");
            try {
              await onSave(caption, y);
            } catch (e) {
              setError(friendlyError(e));
              setBusy(false);
            }
          }}
        >
          Save photo
        </Button>
      </div>
    </>
  );
}

function Viewer({ photo, url, familyId, personId, userId, canAdd, isAdmin, onDelete, onRestored }: { photo: AlbumPhoto; url?: string; familyId: string; personId: string; userId: string; canAdd: boolean; isAdmin: boolean; onDelete: () => void; onRestored: (id: string) => void }) {
  return (
    <>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={photo.caption ?? "Family photo"} className="max-h-[60vh] w-full rounded-xl object-contain" />
      ) : (
        <div className="aspect-[4/3] w-full rounded-xl bg-black/5 dark:bg-white/10" />
      )}
      {/* Right under the photo: play / pause bars for the stories told about it. */}
      <VoiceStories familyId={familyId} personId={personId} photoId={photo.id} canAdd={canAdd} userId={userId} isAdmin={isAdmin} heading="Stories about this photo" />
      {(photo.caption || photo.year) && <p className="text-center text-sm">{[photo.caption, photo.year].filter(Boolean).join(" · ")}</p>}
      {canAdd && photo.kind === "photo" && <AiRestoreButton familyId={familyId} photoId={photo.id} onDone={onRestored} />}
      {(photo.created_by === userId || isAdmin) && (
        <Button type="button" variant="danger" onClick={onDelete}>Delete photo</Button>
      )}
    </>
  );
}
