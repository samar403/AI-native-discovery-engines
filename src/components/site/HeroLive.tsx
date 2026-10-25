"use client";

import { useEffect, useRef } from "react";
import { Reactor } from "@/components/reactor/Reactor";
import { useDiscovery } from "@/hooks/useDiscovery";
import { PHASES } from "@/lib/ui";

/** A real discovery run (not a video) playing in the hero, looping with a fresh seed. */
export function HeroLive() {
  const run = useDiscovery({ autoLoop: true });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run.setSpeed(2);
    run.start({ labId: "kepler", seed: 1, theorist: "builtin", designMode: "adaptive" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = run.snapshot;
  const leader = s?.hypotheses.find((h) => h.id === (s.discovery?.hypothesisId ?? s.bestId));
  const phase = PHASES.find((p) => p.id === s?.phase);
  const last = s?.notebook[s.notebook.length - 1];

  return (
    <div className="relative">
      <div className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(255,181,71,0.10),transparent_60%)]" aria-hidden="true" />
      <Reactor snapshot={s} compact />
      <div className="relative mt-2 rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose" />
          </span>
          <span className="eyebrow">live · exoplanet survey · cycle {s?.cycle ?? 0}</span>
          <span className="ml-auto font-mono text-[11px] text-ink-4">{s?.observations.length ?? 0} experiments</span>
        </div>
        <div className="mt-2 min-h-[44px] font-mono text-[13px] text-ink">
          {s?.discovery ? (
            <span className="text-[var(--st-discovered)]">✦ {s.discovery.equation}</span>
          ) : leader?.fit?.ok ? (
            <span>
              <span className="text-ink-4">leader → </span>
              {leader.fit.equation}
            </span>
          ) : (
            <span className="text-ink-4">{phase?.verb ?? "booting"}…</span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-[12px] text-ink-3">{last?.text}</p>
      </div>
    </div>
  );
}
