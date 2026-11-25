"use client";

import { useState, type FormEvent } from "react";
import { sb } from "@/shared/lib/supabase";
import { friendlyError } from "@/shared/lib/errors";
import { Button, ErrorText, Field, Input } from "@/shared/ui/form";
import { cleanOptions, MAX_OPTIONS, pollProblem } from "./polls";

const CLOSE_AFTER = [
  ["", "Stays open"],
  ["1", "Closes in 1 day"],
  ["3", "Closes in 3 days"],
  ["7", "Closes in 7 days"],
] as const;

export default function NewPoll({ roomId, onDone, onCancel }: { roomId: string; onDone: () => void; onCancel: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [days, setDays] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = pollProblem(question, options);
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    const { error } = await sb().rpc("create_poll", {
      p_room_id: roomId,
      p_question: question.trim(),
      p_options: cleanOptions(options),
      p_closes_at: days ? new Date(Date.now() + Number(days) * 86400000).toISOString() : undefined,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    onDone();
  }

  return (
    <form onSubmit={submit} aria-label="New poll" className="mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-black/15 bg-background p-4 shadow-lg dark:border-white/20">
      <p className="text-lg font-semibold">Ask the family</p>
      <Field label="Question">
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} placeholder="Which day for the temple visit?" />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Choices (2 to 5)</legend>
        {options.map((o, i) => (
          <div key={i} className="flex gap-2">
            <Input aria-label={`Choice ${i + 1}`} value={o} maxLength={80} onChange={(e) => setOptions((c) => c.map((x, k) => (k === i ? e.target.value : x)))} placeholder={`Choice ${i + 1}`} />
            {options.length > 2 && (
              <button type="button" aria-label={`Remove choice ${i + 1}`} onClick={() => setOptions((c) => c.filter((_, k) => k !== i))} className="min-h-12 min-w-12 rounded-lg border border-black/15 dark:border-white/20">✕</button>
            )}
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <button type="button" onClick={() => setOptions((c) => [...c, ""])} className="min-h-12 self-start rounded-lg px-3 font-medium text-brand">+ Add a choice</button>
        )}
      </fieldset>
      <Field label="When does it end?">
        <select value={days} onChange={(e) => setDays(e.target.value)} className="min-h-12 w-full rounded-lg border border-black/15 bg-white px-3 dark:border-white/20 dark:bg-stone-900">
          {CLOSE_AFTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button type="submit" busy={busy} className="flex-1">Post poll</Button>
      </div>
    </form>
  );
}
