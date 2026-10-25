import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-4 py-8 text-sm text-ink-3 sm:flex-row sm:items-center sm:px-6">
        <p>
          <span className="font-display text-base italic text-ink-2">Eureka</span> — hypotheses in, laws out. Open source, runs in your browser.
        </p>
        <div className="flex gap-5 sm:ml-auto">
          <Link href="/method" className="hover:text-ink">Method</Link>
          <Link href="/benchmark" className="hover:text-ink">Benchmark</Link>
          <a href="https://github.com/samar403/ai-native-discovery-engines" className="hover:text-ink">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
