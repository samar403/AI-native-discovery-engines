/**
 * The Designer: chooses which experiments to run next.
 *
 *  - screening:     Latin-hypercube sweep when nothing is known yet
 *  - discriminate:  settings where the leading rival hypotheses disagree the most
 *                   (Box–Hill style model discrimination) plus an exploration bonus
 *  - optimize:      exploit the leading model to probe the predicted optimum
 *  - random:        baseline used by the benchmark
 */
import { compile, fmt } from "./grammar";
import type { Rng } from "./rng";
import { variance } from "./stats";
import type { DesignStrategy, ExperimentDesign, Hypothesis, Inputs, Lab, Observation, Variable } from "./types";

export function toUnit(v: Variable, x: number): number {
  if (v.scale === "log" && v.min > 0) return Math.log(x / v.min) / Math.log(v.max / v.min);
  return (x - v.min) / (v.max - v.min);
}

export function fromUnit(v: Variable, u: number): number {
  const c = Math.min(Math.max(u, 0), 1);
  if (v.scale === "log" && v.min > 0) return v.min * Math.pow(v.max / v.min, c);
  return v.min + c * (v.max - v.min);
}

const round = (x: number) => Number(x.toPrecision(4));

export function latinHypercube(vars: readonly Variable[], n: number, rng: Rng): Inputs[] {
  const cols = vars.map(() => rng.shuffle(Array.from({ length: n }, (_, i) => i)));
  return Array.from({ length: n }, (_, i) =>
    Object.fromEntries(vars.map((v, j) => [v.name, round(fromUnit(v, (cols[j][i] + rng.next()) / n))])),
  );
}

function unitDistance(vars: readonly Variable[], a: Inputs, b: Inputs): number {
  let d = 0;
  for (const v of vars) d += (toUnit(v, a[v.name]) - toUnit(v, b[v.name])) ** 2;
  return Math.sqrt(d / vars.length);
}

export interface DesignContext {
  lab: Lab;
  cycle: number;
  batch: number;
  observations: readonly Observation[];
  hypotheses: readonly Hypothesis[];
  bestId?: string;
  mode: "adaptive" | "random";
  logResponse: boolean;
  rng: Rng;
}

let designCounter = 0;

export function designBatch(ctx: DesignContext): ExperimentDesign {
  const { lab, cycle, batch, rng } = ctx;
  const vars = lab.variables;
  const id = `D${cycle}-${++designCounter}`;
  const make = (strategy: DesignStrategy, points: Inputs[], rationale: string, targets: string[] = []) => ({
    id,
    cycle,
    strategy,
    points,
    rationale,
    targets,
  });

  if (ctx.mode === "random") {
    const pts = Array.from({ length: batch }, () =>
      Object.fromEntries(vars.map((v) => [v.name, round(fromUnit(v, rng.next()))])),
    );
    return make("random", pts, `Random design: ${batch} uniformly sampled settings (baseline).`);
  }

  const contenders = ctx.hypotheses
    .filter((h) => h.status !== "refuted" && h.fit?.ok)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);

  if (ctx.observations.length === 0 || contenders.length < 2) {
    return make(
      "screening",
      latinHypercube(vars, batch, rng),
      `Screening sweep: a ${batch}-point Latin hypercube spreads measurements evenly across all ${vars.length} variables so no region of the design space is left unexplored.`,
    );
  }

  const names = vars.map((v) => v.name);
  const tf = (v: number) => (ctx.logResponse ? Math.log(Math.max(v, 1e-300)) : v);
  const models = contenders.map((h) => ({ h, f: compile(h.form, names) }));
  const rawW = contenders.map((h) => Math.max(h.weight, 0.1));
  const wSum = rawW.reduce((a, b) => a + b, 0);
  const w = rawW.map((x) => x / wSum);
  const scaleY = Math.max(variance(ctx.observations.map((o) => tf(o.output))), 1e-12);

  const candidates = latinHypercube(vars, 320, rng);
  const scored = candidates.map((c) => {
    const x = names.map((n) => c[n]);
    const preds = models.map((m) => tf(m.f(m.h.fit!.params, x)));
    const finite = preds.every(Number.isFinite);
    const mean = preds.reduce((a, p, i) => a + w[i] * p, 0);
    const disagreement = finite ? preds.reduce((a, p, i) => a + w[i] * (p - mean) ** 2, 0) / scaleY : 0;
    let nearest = Infinity;
    for (const o of ctx.observations) nearest = Math.min(nearest, unitDistance(vars, c, o.inputs));
    return { c, disagreement, nearest, bestPred: finite ? preds[0] : -Infinity, gap: finite ? Math.max(...preds) - Math.min(...preds) : 0 };
  });

  const maxD = Math.max(...scored.map((s) => s.disagreement), 1e-12);
  const maxN = Math.max(...scored.map((s) => s.nearest), 1e-12);
  const beta = Math.max(0.12, 0.4 - 0.05 * cycle);

  const leader = contenders[0];
  const optimizing =
    !!lab.objective && leader.weight >= 0.6 && (leader.fit?.cvR2 ?? 0) > 0.8 && ctx.observations.length >= 3 * batch;
  const nOpt = optimizing ? Math.ceil(batch / 2) : 0;

  const pick = (score: (s: (typeof scored)[number]) => number, k: number, taken: Inputs[]) => {
    const pool = scored.map((s) => ({ s, v: score(s) }));
    const penalize = (t: Inputs) => {
      for (const p of pool) if (unitDistance(vars, p.s.c, t) < 0.1) p.v *= 0.15;
    };
    taken.forEach(penalize);
    const chosen: Inputs[] = [];
    for (let i = 0; i < k; i++) {
      pool.sort((a, b) => b.v - a.v);
      const top = pool.shift();
      if (!top) break;
      chosen.push(top.s.c);
      penalize(top.s.c);
    }
    return chosen;
  };

  const sign = lab.objective === "minimize" ? -1 : 1;
  const bestVals = scored.map((s) => sign * s.bestPred).filter(Number.isFinite);
  const lo = Math.min(...bestVals);
  const hi = Math.max(...bestVals);
  const optPts = nOpt
    ? pick((s) => ((sign * s.bestPred - lo) / Math.max(hi - lo, 1e-12)) ** 3 + 0.1 * (s.nearest / maxN), nOpt, [])
    : [];
  const discPts = pick((s) => s.disagreement / maxD + beta * (s.nearest / maxN), batch - nOpt, optPts);

  const topGap = scored.reduce((a, s) => Math.max(a, s.gap), 0);
  const gapText = ctx.logResponse
    ? `${fmt((Math.exp(topGap) - 1) * 100, 2)}% apart`
    : `${fmt(topGap)} ${lab.output.unit} apart`.trim();
  const rivals = contenders
    .slice(0, 3)
    .map((h) => h.label)
    .join(" vs ");
  const rationale = optimizing
    ? `Leader ${leader.label} is confident (p=${fmt(leader.weight, 2)}). Splitting the batch: ${nOpt} runs probe its predicted ${lab.objective === "maximize" ? "maximum" : "minimum"}, ${batch - nOpt} keep stress-testing rivals (${rivals}).`
    : `Discriminating design: ${batch - nOpt} settings where ${rivals} disagree most (predictions up to ${gapText}), with an exploration bonus β=${fmt(beta, 2)} toward unsampled regions.`;

  return make(optimizing ? "optimize" : "discriminate", [...optPts, ...discPts], rationale, contenders.map((h) => h.id));
}
