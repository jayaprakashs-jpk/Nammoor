"use client";

import { useState } from "react";
import { sb } from "@/shared/lib/supabase";
import { friendlyError } from "@/shared/lib/errors";
import { toast } from "@/shared/ui/Toast";
import { Button, ErrorText, Section } from "@/shared/ui/form";
import { toGedcom } from "./gedcom";
import { buildBackup } from "./json";
import { backupFileName, saveTextFile } from "./file";
import type { BackupData } from "./types";

export function Export({ familyId, familyName }: { familyId: string; familyName: string }) {
  const [busy, setBusy] = useState<"json" | "ged" | null>(null);
  const [error, setError] = useState("");
  const [last, setLast] = useState("");

  async function run(kind: "json" | "ged") {
    setBusy(kind);
    setError("");
    try {
      const { data, error } = await sb().rpc("export_family", { p_family_id: familyId });
      if (error) throw error;
      const backup = buildBackup(data as unknown as Omit<BackupData, "events">);
      const name = backupFileName(familyName, kind);
      const r =
        kind === "json"
          ? await saveTextFile(name, "application/json", JSON.stringify(backup, null, 2))
          : await saveTextFile(name, "text/plain", toGedcom(backup, name));
      if (r.how !== "cancelled") {
        setLast(`${backup.persons.length} people, ${backup.parent_child.length} parent links, ${backup.unions.length} marriages`);
        toast(r.how === "shared" ? "Choose where to save it ✓" : "Backup downloaded ✓");
      }
    } catch (e) {
      const m = friendlyError(e);
      setError(m);
      toast(`Export failed. ${m}`, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Save a copy of your family tree">
        <p className="text-sm">
          One tap, then pick where to keep it: your phone&apos;s Files, Google Drive, or send it on WhatsApp.
        </p>
        <Button onClick={() => run("json")} busy={busy === "json"} disabled={!!busy}>Save backup (.json)</Button>
        <p className="-mt-1 text-xs opacity-70">Best for restoring into Nammoor. Includes people, marriages, parent links, work, education, notes and a list of dated events.</p>
        <Button variant="secondary" onClick={() => run("ged")} busy={busy === "ged"} disabled={!!busy}>Save GEDCOM (.ged)</Button>
        <p className="-mt-1 text-xs opacity-70">The standard format that other family tree programs and websites can open.</p>
        <ErrorText>{error}</ErrorText>
        {last && <p className="text-sm font-medium text-brand">Saved: {last}</p>}
      </Section>
      <Section title="What is not in the file">
        <ul className="list-disc pl-5 text-sm">
          <li>Salary and DNA details. They stay private to each person.</li>
          <li>Phone numbers, emails and addresses.</li>
          <li>Photos, chat messages, and who has an account.</li>
        </ul>
        <p className="text-xs opacity-70">Keep backup files safe. They contain names, birth dates and family stories.</p>
      </Section>
    </div>
  );
}
