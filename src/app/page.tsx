import Link from "next/link";
import { HomeRedirect } from "./HomeRedirect";

// Welcome screen for signed-out people. Static HTML, tiny.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 p-6">
      <HomeRedirect />
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold text-brand">Nammoor</h1>
        <p className="text-lg">நம்மூர்</p>
        <p className="opacity-70">Your family tree, built together. Every relative adds their own branch.</p>
      </header>
      <nav className="flex flex-col gap-3">
        <Link href="/login/" className="min-h-12 rounded-lg bg-brand px-4 py-3 text-center font-medium text-white">
          Sign in or start a family
        </Link>
        <Link href="/invite/" className="min-h-12 rounded-lg border border-black/15 px-4 py-3 text-center font-medium dark:border-white/20">
          I have an invite code
        </Link>
      </nav>
    </main>
  );
}
