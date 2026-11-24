"use client";

import { useSearchParams } from "next/navigation";
import { CreateInvite } from "./CreateInvite";
import { JoinFamily } from "./JoinFamily";
import { RequireAuth } from "@/shared/ui/RequireAuth";

// /invite/?family=ID[&person=ID] -> make an invite (signed in)
// /invite/?t=CODE or /invite/       -> join a family (preview works signed out)
export default function InvitesModule() {
  const params = useSearchParams();
  const family = params.get("family");
  if (family) {
    return (
      <RequireAuth>
        {(uid) => <CreateInvite familyId={family} personId={params.get("person")} userId={uid} />}
      </RequireAuth>
    );
  }
  return <JoinFamily initialCode={params.get("t") ?? ""} />;
}
