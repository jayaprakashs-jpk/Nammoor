"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sb, type Enums } from "@/shared/lib/supabase";
import { friendlyError } from "@/shared/lib/errors";
import { Header } from "@/shared/ui/Header";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { ErrorText } from "@/shared/ui/form";
import { dayLabel } from "./messages";

interface Row {
  id: string;
  name: string;
  kind: Enums<"chat_room_kind_t">;
  last_message_at: string | null;
  unread: boolean;
}

export function RoomList({ familyId, userId }: { familyId: string; userId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      sb().from("chat_rooms").select("id, name, kind, last_message_at").eq("family_id", familyId),
      sb().from("chat_room_members").select("room_id, last_read_at").eq("user_id", userId),
    ]).then(([rooms, mine]) => {
      if (!alive) return;
      const err = rooms.error || mine.error;
      if (err) return setError(friendlyError(err));
      const read = new Map((mine.data ?? []).map((r) => [r.room_id, r.last_read_at]));
      setRows(
        (rooms.data ?? [])
          .filter((r) => read.has(r.id))
          .map((r) => ({ ...r, unread: !!r.last_message_at && (!read.get(r.id) || read.get(r.id)! < r.last_message_at) }))
          .sort((a, b) => (a.kind === "family" ? -1 : b.kind === "family" ? 1 : (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))),
      );
    });
    return () => {
      alive = false;
    };
  }, [familyId, userId]);

  return (
    <div className="flex flex-1 flex-col">
      <Header
        title="Family chat"
        sub="குடும்ப அரட்டை"
        back="/tree/"
        right={<Link href={`/chat/?family=${familyId}&new=1`} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white">New group</Link>}
      />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4">
        <ErrorText>{error}</ErrorText>
        {!rows && !error ? (
          <ModuleLoading />
        ) : (
          <ul className="divide-y divide-black/5 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/15">
            {rows?.map((r) => (
              <li key={r.id}>
                <Link href={`/chat/?family=${familyId}&room=${r.id}`} className="flex items-center gap-3 p-4 active:bg-black/5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg dark:bg-amber-900">
                    {r.kind === "family" ? "🏠" : "👥"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${r.unread ? "font-bold" : "font-medium"}`}>{r.name}</span>
                    <span className="block text-xs opacity-60">
                      {r.kind === "family" ? "Everyone in the family" : "Private group"}
                      {r.last_message_at && ` · ${dayLabel(r.last_message_at)}`}
                    </span>
                  </span>
                  {r.unread && <span className="h-3 w-3 rounded-full bg-brand" aria-label="New messages" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
