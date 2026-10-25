import { describe, expect, it } from "vitest";
import { fitForm, toDataset } from "../src/engine/fit";
import { compile, formKey, paramNames, validateForm } from "../src/engine/grammar";
import { kepler } from "../src/engine/labs";
import { createRng } from "../src/engine/rng";
import type { HypothesisForm, Observation } from "../src/engine/types";

const keplerLaw: HypothesisForm = {
  combine: "product",
  terms: [
    { variable: "a", shape: "power" },
    { variable: "M", shape: "power" },
  ],
};

describe("hypothesis grammar", () => {
  it("names parameters and evaluates forms", () => {
    expect(paramNames(keplerLaw)).toEqual(["A", "a.p", "M.p"]);
    const f = compile(keplerLaw, ["a", "M"]);
    expect(f([1, 1.5, -0.5], [4, 1])).toBeCloseTo(8);
  });

  it("has order-independent keys", () => {
    const flipped: HypothesisForm = { combine: "product", terms: [...keplerLaw.terms].reverse() };
    expect(formKey(flipped)).toBe(formKey(keplerLaw));
  });

  it("rejects invalid hypotheses", () => {
    expect(validateForm({ combine: "sum", terms: [{ variable: "nope", shape: "linear" }] }, kepler.variables)).toMatch(/unknown/);
    expect(validateForm({ combine: "product", terms: [{ variable: "a", shape: "quadratic" }] }, kepler.variables)).toMatch(/not allowed/);
    expect(validateForm(keplerLaw, kepler.variables)).toBeNull();
  });

  it("fits Kepler's third law from noisy data", () => {
    const rng = createRng(3);
    const obs: Observation[] = Array.from({ length: 30 }, (_, i) => {
      const inputs = { a: rng.uniform(0.2, 40), M: rng.uniform(0.3, 3), mp: rng.uniform(0.1, 300) };
      return { id: i, cycle: 1, designId: "t", inputs, output: kepler.run(inputs, rng) };
    });
    const ds = toDataset(obs, ["a", "M", "mp"]);
    expect(ds.logResponse).toBe(true);
    const fit = fitForm(keplerLaw, ds, kepler.output);
    expect(fit.ok).toBe(true);
    expect(fit.params[1]).toBeCloseTo(1.5, 1);
    expect(fit.params[2]).toBeCloseTo(-0.5, 1);
    expect(fit.cvR2).toBeGreaterThan(0.99);
  });
});
