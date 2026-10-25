/**
 * The Analyst and the Critic: fit every live hypothesis, convert BIC into posterior
 * model probabilities, falsify the losers, ablate variables and audit residuals.
 */
import { compile, fmt, PRODUCT_SHAPES } from "./grammar";
import { fitForm, type Dataset } from "./fit";
import { benjaminiHochberg, correlationPValue, mean, pearson } from "./stats";
import type { Anomaly, Hypothesis, HypothesisForm, Lab, ShapeId, VariableImportance } from "./types";
import { toUnit } from "./design";

export const MAX_ALIVE = 14;

export interface AnalysisReport {
  bestId?: string;
  /** Posterior mass of the leader plus hypotheses that are observationally equivalent to it. */
  confidence: number;
  equivalents: string[];
  importance: VariableImportance[];
  anomalies: Anomaly[];
  refuted: Hypothesis[];
  promoted: Hypothesis[];
}

export function updateBeliefs(
  hypotheses: Hypothesis[],
  ds: Dataset,
  lab: Lab,
  cycle: number,
  seed: number,
): AnalysisReport {
  const live = hypotheses.filter((h) => h.status !== "refuted");
  for (const h of live) {
    h.fit = fitForm(h.form, ds, lab.output, { seed: seed + cycle, warmStart: h.fit?.ok ? h.fit.params : undefined });
  }

  const fitted = live.filter((h) => h.fit?.ok);
  const refuted: Hypothesis[] = [];
  for (const h of live) {
    if (h.fit && !h.fit.ok && h.fit.equation !== "insufficient data") {
      h.status = "refuted";
      h.diedCycle = cycle;
      h.verdict = `Could not be fitted to the data (${h.fit.equation}).`;
      refuted.push(h);
    } else if (!h.fit?.ok) {
      h.status = "proposed";
    }
  }

  if (!fitted.length) {
    return { importance: [], anomalies: [], refuted, promoted: [], confidence: 0, equivalents: [] };
  }

  const minBic = Math.min(...fitted.map((h) => h.fit!.bic));
  const raw = fitted.map((h) => h.prior * Math.exp(-0.5 * (h.fit!.bic - minBic)));
  const Z = raw.reduce((a, b) => a + b, 0) || 1;
  fitted.forEach((h, i) => (h.weight = raw[i] / Z));
  for (const h of hypotheses) if (!fitted.includes(h)) h.weight = 0;

  const best = fitted.reduce((a, b) => (b.weight > a.weight ? b : a));
  const promoted: Hypothesis[] = [];

  for (const h of fitted) {
    const f = h.fit!;
    const age = cycle - h.bornCycle;
    const dBic = f.bic - best.fit!.bic;
    if (h !== best && age >= 1 && h.weight < 1e-3 && f.cvR2 < best.fit!.cvR2 - 0.005) {
      h.status = "refuted";
      h.diedCycle = cycle;
      h.verdict = `Falsified: ΔBIC = +${fmt(dBic, 3)} vs ${best.id} (odds < 1:1000), out-of-sample R² ${fmt(f.cvR2, 3)} vs ${fmt(best.fit!.cvR2, 3)}.`;
      refuted.push(h);
      continue;
    }
    const equivalence = h.fit!.k > best.fit!.k && age >= 1 ? observationalGap(h, best, ds) : Infinity;
    if (equivalence < 0.25) {
      h.status = "refuted";
      h.diedCycle = cycle;
      h.verdict = `Occam: observationally equivalent to ${best.id} on all ${f.n} measurements (predictions differ by ${fmt(equivalence, 2)}σ) yet needs ${f.k - best.fit!.k} more parameter${f.k - best.fit!.k > 1 ? "s" : ""}.`;
      refuted.push(h);
      continue;
    }
    const extra = extensionOf(h, best);
    if (extra && age >= 1 && dBic > 2 && f.n >= 3 * f.k) {
      h.status = "refuted";
      h.diedCycle = cycle;
      h.verdict = `Occam: extends ${best.id} with ${extra} but the extra parameters do not pay for themselves (ΔBIC +${fmt(dBic, 3)}).`;
      refuted.push(h);
      continue;
    }
    const wasSupported = h.status === "supported";
    h.status = h.weight >= 0.5 && f.cvR2 >= 0.9 ? "supported" : "testing";
    if (h.status === "supported" && !wasSupported) promoted.push(h);
  }

  // Keep the population manageable: prune the weakest survivors.
  const alive = fitted.filter((h) => h.status !== "refuted").sort((a, b) => a.weight - b.weight);
  while (alive.length > MAX_ALIVE && alive[0].weight < 0.02) {
    const h = alive.shift()!;
    h.status = "refuted";
    h.diedCycle = cycle;
    h.verdict = `Pruned: posterior ${fmt(h.weight, 2)} — evidence concentrated elsewhere.`;
    refuted.push(h);
  }

  // Renormalise the posterior over the survivors.
  const survivors = fitted.filter((h) => h.status !== "refuted");
  const mass = survivors.reduce((a, h) => a + h.weight, 0) || 1;
  for (const h of hypotheses) h.weight = survivors.includes(h) ? h.weight / mass : 0;

  for (const h of hypotheses) {
    if (h.fit?.ok) h.history.push({ cycle, weight: h.weight, cvR2: h.fit.cvR2 });
  }

  // Observational-equivalence class of the leader: same variables, indistinguishable predictions.
  const vars = (h: Hypothesis) => h.form.terms.map((t) => t.variable).sort().join(",");
  const equivalents = survivors.filter(
    (h) => h !== best && vars(h) === vars(best) && observationalGap(h, best, ds) < 0.5,
  );
  const confidence = best.weight + equivalents.reduce((a, h) => a + h.weight, 0);

  return {
    bestId: best.id,
    confidence,
    equivalents: equivalents.map((h) => h.id),
    importance: variableImportance(best, ds, lab, seed + cycle),
    anomalies: residualAudit(best, ds, lab),
    refuted,
    promoted,
  };
}

/** RMS difference between two fitted models' predictions, in units of the leader's residual σ. */
function observationalGap(h: Hypothesis, best: Hypothesis, ds: Dataset): number {
  const fh = compile(h.form, ds.vars);
  const fb = compile(best.form, ds.vars);
  const tf = (v: number) => (ds.logResponse ? Math.log(Math.max(v, 1e-300)) : v);
  let ss = 0;
  for (const x of ds.X) {
    const d = tf(fh(h.fit!.params, x)) - tf(fb(best.fit!.params, x));
    ss += d * d;
  }
  const rms = Math.sqrt(ss / ds.X.length);
  return Number.isFinite(rms) ? rms / Math.max(best.fit!.rmse, 1e-12) : Infinity;
}

/** If `h` strictly extends `base` (same combine, superset of its terms), describe the extra terms. */
function extensionOf(h: Hypothesis, base: Hypothesis): string | null {
  if (h === base || h.form.combine !== base.form.combine) return null;
  if (h.form.terms.length <= base.form.terms.length) return null;
  const covers = base.form.terms.every((t) => h.form.terms.some((x) => x.variable === t.variable && x.shape === t.shape));
  if (!covers) return null;
  return h.form.terms
    .filter((t) => !base.form.terms.some((x) => x.variable === t.variable))
    .map((t) => `${t.variable} (${t.shape})`)
    .join(", ");
}

/** Ablation: what happens to the evidence if a variable is removed from / added to the leader? */
export function variableImportance(best: Hypothesis, ds: Dataset, lab: Lab, seed: number): VariableImportance[] {
  const bf = best.fit!;
  return lab.variables.map((v) => {
    const inBest = best.form.terms.some((t) => t.variable === v.name);
    if (inBest) {
      const reduced: HypothesisForm = { ...best.form, terms: best.form.terms.filter((t) => t.variable !== v.name) };
      const f = fitForm(reduced, ds, lab.output, { seed, restarts: 1 });
      const deltaBic = f.ok ? f.bic - bf.bic : Infinity;
      const deltaCvR2 = f.ok ? bf.cvR2 - Math.max(f.cvR2, -1) : 1;
      return {
        variable: v.name,
        inBest,
        deltaBic,
        deltaCvR2,
        verdict: deltaBic > 10 ? "essential" : deltaBic > 2 ? "minor" : "irrelevant",
      };
    }
    const shapes: ShapeId[] = best.form.combine === "product" ? ["power", "exp", "peak"] : ["linear", "quadratic", "peak"];
    let bestGain = -Infinity;
    let cvGain = 0;
    for (const shape of shapes) {
      if (best.form.combine === "product" && !PRODUCT_SHAPES.includes(shape)) continue;
      if (shape === "power" && v.min <= 0) continue;
      const extended: HypothesisForm = { ...best.form, terms: [...best.form.terms, { variable: v.name, shape }] };
      const f = fitForm(extended, ds, lab.output, { cv: false, seed, restarts: 0 });
      if (f.ok && bf.bic - f.bic > bestGain) {
        bestGain = bf.bic - f.bic;
        cvGain = f.r2 - bf.r2;
      }
    }
    return {
      variable: v.name,
      inBest,
      deltaBic: bestGain,
      deltaCvR2: cvGain,
      verdict: bestGain > 10 ? "essential" : bestGain > 2 ? "minor" : "irrelevant",
    };
  });
}

/** Residual audit: is there structure the leader fails to explain? (BH-corrected) */
export function residualAudit(best: Hypothesis, ds: Dataset, lab: Lab): Anomaly[] {
  const f = compile(best.form, ds.vars);
  const tf = (v: number) => (ds.logResponse ? Math.log(Math.max(v, 1e-300)) : v);
  const resid = ds.X.map((x, i) => tf(ds.y[i]) - tf(f(best.fit!.params, x)));
  if (resid.length < 12 || resid.some((r) => !Number.isFinite(r))) return [];
  const tests: { variable: string; shape: ShapeId; r: number; p: number }[] = [];
  lab.variables.forEach((v) => {
    const j = ds.vars.indexOf(v.name);
    const u = ds.X.map((row) => toUnit(v, row[j]));
    const curv = u.map((x) => (x - mean(u)) ** 2);
    const probes: [ShapeId, number[]][] = [
      ["linear", u],
      ["peak", curv],
    ];
    for (const [shape, xs] of probes) {
      const r = pearson(xs, resid);
      tests.push({ variable: v.name, shape, r, p: correlationPValue(r, resid.length) });
    }
  });
  const adj = benjaminiHochberg(tests.map((t) => t.p));
  const out: Anomaly[] = [];
  const seen = new Set<string>();
  tests.forEach((t, i) => {
    if (adj[i] < 0.01 && Math.abs(t.r) > 0.3 && !seen.has(t.variable)) {
      seen.add(t.variable);
      const label = lab.variables.find((v) => v.name === t.variable)?.label ?? t.variable;
      out.push({
        ...t,
        p: adj[i],
        message:
          t.shape === "peak"
            ? `Residuals of ${best.id} bend with ${label} (r=${fmt(t.r, 2)}, q=${fmt(adj[i], 2)}): unexplained curvature.`
            : `Residuals of ${best.id} trend with ${label} (r=${fmt(t.r, 2)}, q=${fmt(adj[i], 2)}): a missing or mis-shaped effect.`,
      });
    }
  });
  return out;
}
