import Link from "next/link";

// Temporary frame used only to prove routing + lazy loading work.
// Real Phase 1 screens replace this after approval.
export function ModuleShell({ title, note }: { title: string; note: string }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-4">
      <Link href="/" className="text-sm text-brand">
        &larr; Home
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm opacity-70">{note}</p>
    </main>
  );
}
