"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCurrentFamilyId } from "@/shared/lib/storage";
import { RequireAuth } from "@/shared/ui/RequireAuth";
import { ModuleLoading } from "@/shared/ui/ModuleLoading";
import { NewGroup } from "./NewGroup";
import { Room } from "./Room";
import { RoomList } from "./RoomList";

// /chat/?family=ID            rooms
// /chat/?family=ID&room=ID    one room
// /chat/?family=ID&new=1      make a private group
export default function ChatModule() {
  return <RequireAuth>{(uid) => <ChatRoute userId={uid} />}</RequireAuth>;
}

function ChatRoute({ userId }: { userId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const familyId = params.get("family") ?? getCurrentFamilyId();
  const room = params.get("room");

  useEffect(() => {
    if (!familyId) router.replace("/tree/");
  }, [familyId, router]);
  if (!familyId) return <ModuleLoading />;

  if (room) return <Room key={room} roomId={room} familyId={familyId} userId={userId} />;
  if (params.get("new")) return <NewGroup familyId={familyId} userId={userId} />;
  return <RoomList familyId={familyId} userId={userId} />;
}
