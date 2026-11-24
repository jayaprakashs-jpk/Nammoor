"use client";

import { useEffect, useState } from "react";

// Small pop-up messages that stay on screen (the page can be long, and an
// error at the bottom of a form is an error nobody sees).
type Kind = "ok" | "error";
interface Item {
  id: number;
  kind: Kind;
  text: string;
}

let next = 1;
const listeners = new Set<(i: Item) => void>();

export function toast(text: string, kind: Kind = "ok") {
  const item = { id: next++, kind, text };
  listeners.forEach((l) => l(item));
}

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const add = (i: Item) => {
      setItems((cur) => [...cur.slice(-2), i]);
      window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== i.id)), i.kind === "error" ? 7000 : 2500);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-live="polite">
      {items.map((i) => (
        <p key={i.id} role={i.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${i.kind === "error" ? "bg-red-700 text-white" : "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"}`}>
          {i.text}
        </p>
      ))}
    </div>
  );
}
