import Link from 'next/link';

// Placeholder — the wallet-client agent replaces this with the Home screen in Wave 1.
export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[390px] flex-col justify-center gap-6 px-4">
      <h1 className="text-28 font-semibold">Keyline</h1>
      <p className="text-ink-2">The wallet screens arrive in Wave 1. The design system is ready to review.</p>
      <Link href="/design" className="kl-link">
        Open the design kitchen sink
      </Link>
    </main>
  );
}
