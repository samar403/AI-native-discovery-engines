import { describe, expect, it } from "vitest";
import { inverse, ols, solve } from "../src/engine/linalg";
import { levenbergMarquardt } from "../src/engine/lm";
import { createRng } from "../src/engine/rng";
import { benjaminiHochberg, correlationPValue, pearson, rSquared } from "../src/engine/stats";

describe("linear algebra", () => {
  it("solves a linear system", () => {
    const x = solve(
      [
        [2, 1],
        [1, 3],
      ],
      [3, 5],
    )!;
    expect(x[0]).toBeCloseTo(0.8);
    expect(x[1]).toBeCloseTo(1.4);
  });

  it("inverts a matrix", () => {
    const inv = inverse([
      [4, 7],
      [2, 6],
    ])!;
    expect(inv[0][0]).toBeCloseTo(0.6);
    expect(inv[1][1]).toBeCloseTo(0.4);
  });

  it("recovers OLS coefficients", () => {
    const X = Array.from({ length: 20 }, (_, i) => [1, i]);
    const y = X.map(([, x]) => 3 + 2 * x);
    const b = ols(X, y)!;
    expect(b[0]).toBeCloseTo(3, 5);
    expect(b[1]).toBeCloseTo(2, 5);
  });
});

describe("statistics", () => {
  it("computes correlation and its significance", () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(pearson(x, x)).toBeCloseTo(1);
    expect(correlationPValue(0.9, 30)).toBeLessThan(1e-6);
    expect(correlationPValue(0.05, 30)).toBeGreaterThan(0.5);
  });

  it("adjusts p-values with Benjamini–Hochberg", () => {
    const adj = benjaminiHochberg([0.01, 0.04, 0.03, 0.5]);
    expect(adj[0]).toBeCloseTo(0.04);
    expect(adj[3]).toBeCloseTo(0.5);
    adj.forEach((a, i) => expect(a).toBeGreaterThanOrEqual([0.01, 0.04, 0.03, 0.5][i]));
  });

  it("is reproducible from a seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.normal()]).toEqual([b.next(), b.normal()]);
  });
});

describe("Levenberg–Marquardt", () => {
  it("fits a Michaelis–Menten curve", () => {
    const rng = createRng(1);
    const S = Array.from({ length: 40 }, (_, i) => 0.2 + i);
    const y = S.map((s) => (100 * s) / (5 + s) + rng.normal());
    const res = levenbergMarquardt((t) => S.map((s) => (t[0] * s) / (t[1] + s)), y, [50, 1]);
    expect(res.params[0]).toBeCloseTo(100, -1);
    expect(res.params[1]).toBeCloseTo(5, 0);
    expect(rSquared(y, S.map((s) => (res.params[0] * s) / (res.params[1] + s)))).toBeGreaterThan(0.99);
    expect(res.stderr.every((e) => e > 0 && e < 5)).toBe(true);
  });
});
