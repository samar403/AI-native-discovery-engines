/** Adaptive discovery loop vs. a random-design baseline, across labs and seeds. */
import { runToEnd } from "./engine";
import { scoreAgainstTruth } from "./report";
import type { Lab } from "./types";

export interface BenchRun {
  labId: string;
  mode: "adaptive" | "random";
  seed: number;
  discovered: boolean;
  experiments: number;
  experimentsToDiscovery?: number;
  truthScore: number;
  cvR2: number;
  ms: number;
}

export interface BenchSummary {
  labId: string;
  mode: "adaptive" | "random";
  runs: number;
  discoveryRate: number;
  meanExperimentsToDiscovery?: number;
  meanTruthScore: number;
}

export async function benchmarkRun(lab: Lab, mode: "adaptive" | "random", seed: number): Promise<BenchRun> {
  const t0 = Date.now();
  const snap = await runToEnd({ lab, seed, designMode: mode });
  const best = snap.hypotheses.find((h) => h.id === (snap.discovery?.hypothesisId ?? snap.bestId));
  return {
    labId: lab.id,
    mode,
    seed,
    discovered: !!snap.discovery,
    experiments: snap.observations.length,
    experimentsToDiscovery: snap.discovery?.experiments,
    truthScore: scoreAgainstTruth(snap, lab)?.score ?? 0,
    cvR2: best?.fit?.cvR2 ?? 0,
    ms: Date.now() - t0,
  };
}

export function summarize(runs: BenchRun[]): BenchSummary[] {
  const groups = new Map<string, BenchRun[]>();
  for (const r of runs) {
    const k = `${r.labId}|${r.mode}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.values()].map((g) => {
    const found = g.filter((r) => r.discovered);
    return {
      labId: g[0].labId,
      mode: g[0].mode,
      runs: g.length,
      discoveryRate: found.length / g.length,
      meanExperimentsToDiscovery: found.length
        ? found.reduce((a, r) => a + (r.experimentsToDiscovery ?? 0), 0) / found.length
        : undefined,
      meanTruthScore: g.reduce((a, r) => a + r.truthScore, 0) / g.length,
    };
  });
}
