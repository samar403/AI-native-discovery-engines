import { describe, expect, it } from "vitest";
import { runEngine, runToEnd } from "../src/engine/engine";
import { createDatasetLab, parseCsv, sampleGasCsv } from "../src/engine/labs/dataset";
import { LABS, demand, electrolyte, kepler } from "../src/engine/labs";
import { buildMarkdownReport, scoreAgainstTruth } from "../src/engine/report";

describe("discovery loop", () => {
  it("rediscovers Kepler's third law and rejects planet mass", async () => {
    const snap = await runToEnd({ lab: kepler, seed: 1 });
    expect(snap.discovery).toBeDefined();
    const score = scoreAgainstTruth(snap, kepler)!;
    expect(score.recall).toBe(1);
    expect(score.precision).toBe(1);
    expect(snap.importance.find((i) => i.variable === "mp")?.verdict).toBe("irrelevant");
  });

  it("finds the conductivity optimum and flags the additive as a red herring", async () => {
    const snap = await runToEnd({ lab: electrolyte, seed: 2 });
    expect(snap.discovery?.optimum?.inputs.c).toBeCloseTo(1.2, 1);
    expect(snap.discovery?.optimum?.inputs.Tk).toBeGreaterThan(55);
    expect(snap.importance.find((i) => i.variable === "add")?.verdict).not.toBe("essential");
  });

  it("is deterministic for a given seed", async () => {
    const a = await runToEnd({ lab: demand, seed: 5 });
    const b = await runToEnd({ lab: demand, seed: 5 });
    expect(a.observations.map((o) => o.output)).toEqual(b.observations.map((o) => o.output));
    expect(a.discovery?.equation).toEqual(b.discovery?.equation);
  });

  it("respects the experiment budget", async () => {
    for await (const s of runEngine({ lab: LABS[1], seed: 9, budget: 20, batch: 8 })) {
      expect(s.snapshot.observations.length).toBeLessThanOrEqual(20);
    }
  });

  it("falls back to the built-in theorist when an agent fails", async () => {
    const broken = { name: "Broken LLM", propose: async () => Promise.reject(new Error("offline")) };
    const snap = await runToEnd({ lab: kepler, seed: 1, agent: broken, budget: 16 });
    expect(snap.notebook.some((n) => n.text.includes("built-in theorist stepped in"))).toBe(true);
    expect(snap.hypotheses.length).toBeGreaterThan(3);
  });

  it("discovers the ideal gas law from an uploaded table", async () => {
    const table = parseCsv(sampleGasCsv());
    const lab = createDatasetLab(table, ["volume_L", "temperature_K", "moles", "humidity_pct"], "pressure_kPa");
    const snap = await runToEnd({ lab, seed: 3, budget: 96 });
    const best = snap.hypotheses.find((h) => h.id === (snap.discovery?.hypothesisId ?? snap.bestId))!;
    const vars = best.form.terms.map((t) => t.variable).sort();
    expect(vars).toEqual(["moles", "temperature_K", "volume_L"]);
    expect(best.fit!.cvR2).toBeGreaterThan(0.98);
    expect(buildMarkdownReport(snap, lab)).toContain("Discovery report");
  });
});
