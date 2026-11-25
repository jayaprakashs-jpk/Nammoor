"use client";

import { closesLabel, isOpen, percents, totalVotes, type Poll, type PollOption } from "./polls";

export interface PollState {
  poll: Poll;
  options: PollOption[];
  /** Option I voted for, if any. */
  mine: string | null;
}

export function PollCard({ s, canClose, onVote, onClose, mine }: { s: PollState; canClose: boolean; onVote: (optionId: string) => void; onClose: () => void; mine: boolean }) {
  const open = isOpen(s.poll);
  const options = [...s.options].sort((a, b) => a.position - b.position);
  const pct = percents(options);
  const total = totalVotes(options);
  return (
    <div role="group" aria-label={`Poll: ${s.poll.question}`} className={`w-[min(22rem,88vw)] rounded-2xl border border-black/15 bg-white p-3 text-left dark:border-white/20 dark:bg-stone-900 ${mine ? "ml-auto" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">📊 Family poll</p>
      <p className="mb-2 mt-1 text-base font-semibold">{s.poll.question}</p>
      <ul className="flex flex-col gap-2">
        {options.map((o, i) => {
          const chosen = s.mine === o.id;
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={!open}
                aria-pressed={chosen}
                onClick={() => onVote(o.id)}
                className={`relative min-h-12 w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-[15px] disabled:cursor-default ${chosen ? "border-brand" : "border-black/15 dark:border-white/20"}`}
              >
                <span aria-hidden className="absolute inset-y-0 left-0 bg-brand/15" style={{ width: `${pct[i]}%` }} />
                <span className="relative flex items-center justify-between gap-2">
                  <span>{chosen ? "✓ " : ""}{o.label}</span>
                  <span className="shrink-0 text-sm tabular-nums opacity-80" data-testid="poll-count">{o.votes} · {pct[i]}%</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex items-center justify-between text-xs opacity-70">
        <span>{total} {total === 1 ? "vote" : "votes"} · {closesLabel(s.poll)}</span>
        {open && canClose && (
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg px-2 font-medium text-red-700 dark:text-red-400">Close poll</button>
        )}
      </p>
      {open && !s.mine && <p className="text-xs opacity-60">Tap a choice to vote. You can change it until the poll closes.</p>}
    </div>
  );
}
