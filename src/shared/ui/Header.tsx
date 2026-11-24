import Link from "next/link";
import type { ReactNode } from "react";

export function Header({ title, sub, back, right }: { title: string; sub?: string; back?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-black/10 bg-background/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] dark:border-white/15">
      {back && (
        <Link href={back} aria-label="Back" className="-ml-2 flex h-10 w-10 items-center justify-center text-2xl">
          &larr;
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold">{title}</h1>
        {sub && <p className="truncate text-xs opacity-60">{sub}</p>}
      </div>
      {right}
    </header>
  );
}
