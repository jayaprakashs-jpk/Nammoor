import Link from "next/link";
import { enabledNav } from "@/config/modules";

// Home. Static HTML, tiny. Each link opens a lazily loaded module.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-4">
      <header>
        <h1 className="text-3xl font-bold text-brand">Nammoor</h1>
        <p className="text-sm opacity-70">நம்மூர் · Your family, your roots</p>
      </header>
      <nav className="grid grid-cols-2 gap-3">
        {enabledNav().map((m) => (
          <Link
            key={m.id}
            href={m.route}
            className="rounded-xl border border-black/10 p-4 active:scale-95 dark:border-white/15"
          >
            <span className="block font-medium">{m.label}</span>
            <span className="block text-sm opacity-70">{m.labelTa}</span>
          </Link>
        ))}
        <Link href="/login/" className="rounded-xl border border-black/10 p-4 dark:border-white/15">
          <span className="block font-medium">Sign in</span>
          <span className="block text-sm opacity-70">உள்நுழை</span>
        </Link>
      </nav>
    </main>
  );
}
