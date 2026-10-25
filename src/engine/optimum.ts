import { fromUnit, latinHypercube, toUnit } from "./design";
import { compile } from "./grammar";
import type { Rng } from "./rng";
import type { Hypothesis, Inputs, Lab } from "./types";

/** Locate the optimum of a fitted model inside the lab's domain (LHS + coordinate refinement). */
export function findOptimum(h: Hypothesis, lab: Lab, rng: Rng): { inputs: Inputs; value: number } | undefined {
  if (!lab.objective || !h.fit?.ok) return undefined;
  const names = lab.variables.map((v) => v.name);
  const f = compile(h.form, names);
  const sign = lab.objective === "maximize" ? 1 : -1;
  const evalAt = (inp: Inputs) => sign * f(h.fit!.params, names.map((n) => inp[n]));

  let best = latinHypercube(lab.variables, 1500, rng).reduce(
    (acc, c) => {
      const v = evalAt(c);
      return Number.isFinite(v) && v > acc.v ? { c, v } : acc;
    },
    { c: {} as Inputs, v: -Infinity },
  );
  if (!Number.isFinite(best.v)) return undefined;

  let step = 0.1;
  while (step > 1e-4) {
    let improved = false;
    for (const v of lab.variables) {
      for (const dir of [-1, 1]) {
        const u = Math.min(Math.max(toUnit(v, best.c[v.name]) + dir * step, 0), 1);
        const cand = { ...best.c, [v.name]: fromUnit(v, u) };
        const val = evalAt(cand);
        if (val > best.v) {
          best = { c: cand, v: val };
          improved = true;
        }
      }
    }
    if (!improved) step /= 2;
  }
  const inputs = Object.fromEntries(Object.entries(best.c).map(([k, v]) => [k, Number(v.toPrecision(4))]));
  return { inputs, value: sign * best.v };
}
