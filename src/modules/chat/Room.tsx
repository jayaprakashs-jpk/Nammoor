"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { sb } from "@/shared/lib/supabase";
import { friendlyError } from "@/shared/lib/errors";
import { Header } from "@/shared/ui/Header";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { ErrorText } from "@/shared/ui/form";
import { dayKey, dayLabel, mergeMessages, newId, timeLabel, type Msg } from "./messages";

const PAGE = 40;
const COLS = "id, room_id, sender_id, body, created_at, edited_at, deleted_at";
const NAME_COLORS = ["#0369a1", "#be185d", "#047857", "#b45309", "#7c3aed", "#0f766e", "#c2410c"];
const colorFor = (id: string) => NAME_COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % NAME_COLORS.length];

export function Room({ roomId, familyId, userId }: { roomId: string; familyId: string; userId: string }) {
  const [room, setRoom] = useState<{ name: string; kind: string } | null | undefined>(undefined);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState(""); // problems while sending
  const [loadError, setLoadError] = useState(""); // problems opening the room
  const [menu, setMenu] = useState<string | null>(null);
  const [older, setOlder] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const newest = useRef<string | null>(null); // newest confirmed message time

  const markRead = useCallback(() => {
    sb().from("chat_room_members").update({ last_read_at: new Date().toISOString() }).eq("room_id", roomId).eq("user_id", userId).then(() => {});
  }, [roomId, userId]);

  const add = useCallback((incoming: Msg[]) => {
    for (const m of incoming) if (!m.state && (!newest.current || m.created_at > newest.current)) newest.current = m.created_at;
    setMsgs((cur) => mergeMessages(cur, incoming));
  }, []);

  // first load
  useEffect(() => {
    let alive = true;
    (async () => {
      const [r, members, latest] = await Promise.all([
        sb().from("chat_rooms").select("name, kind").eq("id", roomId).maybeSingle(),
        sb().from("chat_room_members").select("user_id, profiles(display_name)").eq("room_id", roomId),
        sb().from("chat_messages").select(COLS).eq("room_id", roomId).order("created_at", { ascending: false }).limit(PAGE),
      ]);
      if (!alive) return;
      const err = r.error || members.error || latest.error;
      if (err) return setLoadError(friendlyError(err));
      setRoom(r.data ?? null);
      setNames(new Map((members.data ?? []).map((m) => [m.user_id, m.profiles?.display_name || "Family member"])));
      const rows = (latest.data ?? []) as Msg[];
      setHasMore(rows.length === PAGE);
      add(rows);
      markRead();
    })();
    return () => {
      alive = false;
    };
  }, [roomId, add, markRead]);

  const fetchNewer = useCallback(async () => {
    let q = sb().from("chat_messages").select(COLS).eq("room_id", roomId).order("created_at", { ascending: true }).limit(100);
    if (newest.current) q = q.gt("created_at", newest.current);
    const { data } = await q;
    if (data?.length) {
      add(data as Msg[]);
      if (document.visibilityState === "visible") markRead();
    }
  }, [roomId, add, markRead]);

  // live updates, plus a slow check in case the phone's connection dropped quietly
  useEffect(() => {
    const ch = sb()
      .channel(`room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` }, (p) => {
        if (p.eventType === "DELETE") return;
        const m = p.new as Msg;
        add([m]);
        if (m.sender_id !== userId && document.visibilityState === "visible") markRead();
      })
      .subscribe();
    const tick = () => document.visibilityState === "visible" && fetchNewer();
    const timer = window.setInterval(tick, 25000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      sb().removeChannel(ch);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [roomId, userId, add, fetchNewer, markRead]);

  // stay at the bottom when new messages arrive, unless you scrolled up to read
  useEffect(() => {
    const last = msgs[msgs.length - 1];
    if (stick.current || last?.sender_id === userId) bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs, userId]);
  useEffect(() => {
    const onScroll = () => {
      stick.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function loadOlder() {
    const first = msgs[0];
    if (!first) return;
    setOlder(true);
    const { data, error } = await sb().from("chat_messages").select(COLS).eq("room_id", roomId).lt("created_at", first.created_at)
      .order("created_at", { ascending: false }).limit(PAGE);
    setOlder(false);
    if (error) return setError(friendlyError(error));
    stick.current = false;
    setHasMore((data?.length ?? 0) === PAGE);
    add((data ?? []) as Msg[]);
  }

  async function deliver(id: string, body: string) {
    const { error } = await sb().from("chat_messages").insert({ id, room_id: roomId, body });
    // 23505 = it already arrived (we are retrying after a lost reply). Fine.
    if (error && error.code !== "23505") {
      setMsgs((cur) => cur.map((m) => (m.id === id ? { ...m, state: "failed" } : m)));
      return setError(friendlyError(error));
    }
    setMsgs((cur) => cur.map((m) => (m.id === id ? { ...m, state: undefined } : m)));
  }

  function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    setError("");
    const id = newId();
    add([{ id, room_id: roomId, sender_id: userId, body, created_at: new Date().toISOString(), edited_at: null, deleted_at: null, state: "sending" }]);
    deliver(id, body);
  }

  async function remove(m: Msg) {
    setMenu(null);
    if (!window.confirm("Delete this message for everyone?")) return;
    const { data, error } = await sb().from("chat_messages").update({ deleted_at: new Date().toISOString(), body: null }).eq("id", m.id).select("id");
    if (error || !data?.length) return setError(error ? friendlyError(error) : "You can only delete your own messages.");
    setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, body: null, deleted_at: new Date().toISOString() } : x)));
  }

  if (loadError) return <main className="p-6"><ErrorText>{loadError}</ErrorText></main>;
  if (room === undefined) return <ModuleLoading />;
  if (room === null)
    return <main className="p-6"><p>This chat was not found, or you are not in it.</p></main>;

  return (
    <div className="flex flex-1 flex-col">
      <Header title={room?.name ?? "Chat"} sub={room?.kind === "family" ? "Everyone in the family" : `${names.size} people`} back={`/chat/?family=${familyId}`} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-1 px-3 pb-24 pt-3">
        {hasMore && (
          <button type="button" onClick={loadOlder} disabled={older} className="mb-2 min-h-10 self-center rounded-full border border-black/15 px-4 text-sm dark:border-white/20">
            {older ? "Loading..." : "Earlier messages"}
          </button>
        )}
        {!msgs.length && <p className="my-8 text-center text-sm opacity-60">No messages yet. Say vanakkam 🙏</p>}
        {msgs.map((m, i) => {
          const mine = m.sender_id === userId;
          const newDay = i === 0 || dayKey(msgs[i - 1].created_at) !== dayKey(m.created_at);
          const showName = !mine && (newDay || msgs[i - 1].sender_id !== m.sender_id);
          return (
            <div key={m.id} className="flex flex-col">
              {newDay && <p className="my-2 self-center rounded-full bg-black/5 px-3 py-0.5 text-xs dark:bg-white/10">{dayLabel(m.created_at)}</p>}
              <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {showName && <span className="px-1 text-xs font-semibold" style={{ color: colorFor(m.sender_id) }}>{names.get(m.sender_id) ?? "Family member"}</span>}
                <button type="button" onClick={() => mine && !m.deleted_at && setMenu(menu === m.id ? null : m.id)}
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left text-[15px] ${
                    mine ? "bg-brand text-white" : "bg-black/5 dark:bg-white/10"} ${m.deleted_at ? "italic opacity-60" : ""} ${m.state === "sending" ? "opacity-70" : ""}`}>
                  {m.deleted_at ? "This message was deleted" : m.body}
                </button>
                <span className="px-1 text-[10px] opacity-50">
                  {m.state === "sending" ? "Sending..." : m.state === "failed" ? "" : timeLabel(m.created_at)}
                  {m.state === "failed" && (
                    <button type="button" className="font-semibold text-red-700" onClick={() => { setMsgs((c) => c.map((x) => (x.id === m.id ? { ...x, state: "sending" } : x))); deliver(m.id, m.body ?? ""); }}>
                      Not sent. Tap to retry
                    </button>
                  )}
                </span>
                {menu === m.id && (
                  <button type="button" onClick={() => remove(m)} className="mt-1 min-h-10 rounded-lg border border-red-600 px-3 text-sm text-red-700">Delete</button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </main>
      <form onSubmit={send} className="fixed inset-x-0 bottom-0 z-10 border-t border-black/10 bg-background/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-white/15">
        <div className="mx-auto flex max-w-xl flex-col gap-1">
          <ErrorText>{error}</ErrorText>
          <div className="flex items-end gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} placeholder="Message"
              aria-label="Message"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); send(); } }}
              className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-black/15 bg-white px-4 py-3 text-base outline-none focus:border-brand dark:border-white/20 dark:bg-stone-900" />
            <button type="submit" disabled={!text.trim()} className="min-h-12 rounded-2xl bg-brand px-5 font-medium text-white disabled:opacity-40">Send</button>
          </div>
        </div>
      </form>
    </div>
  );
}
