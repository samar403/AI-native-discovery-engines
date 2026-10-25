"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/lab", label: "Lab", long: "Lab console" },
  { href: "/benchmark", label: "Benchmark", long: "Benchmark" },
  { href: "/method", label: "Method", long: "Method" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Eureka home">
          <Logo />
          <span className="font-display text-[22px] italic leading-none">Eureka</span>
          <span className="hidden rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-ink-3 sm:inline">
            discovery engine
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-0.5 text-sm sm:gap-1">
          {LINKS.map((l) => {
            const active = path?.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-full px-2.5 py-1.5 transition-colors sm:px-3 ${active ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink"}`}
              >
                <span className="sm:hidden">{l.label}</span>
                <span className="hidden sm:inline">{l.long}</span>
              </Link>
            );
          })}
          <Link
            href="/lab"
            className="ml-2 hidden rounded-full bg-phosphor px-4 py-1.5 text-sm font-medium text-black transition hover:brightness-110 md:inline-block"
          >
            Run a discovery →
          </Link>
        </nav>
      </div>
    </header>
  );
}
