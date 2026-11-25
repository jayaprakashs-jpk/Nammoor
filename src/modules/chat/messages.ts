// Pure helpers for the chat screen.

export interface Msg {
  id: string;
  room_id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  /** Set when this message is a poll card. */
  poll_id?: string | null;
  /** Only on this phone: not confirmed by the server yet. */
  state?: "sending" | "failed";
}

/** Add or update messages by id, oldest first. */
export function mergeMessages(list: Msg[], incoming: Msg[]): Msg[] {
  const map = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) {
    const old = map.get(m.id);
    // a confirmed copy from the server always wins over our local "sending" copy
    map.set(m.id, old ? { ...old, ...m, state: m.state } : m);
  }
  return [...map.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1));
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** crypto.randomUUID needs a secure page. Android WebView is, old browsers may not be. */
export function newId(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
