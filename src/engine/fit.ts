/**
 * Fitting machinery: robust initialisation (grid + OLS backfitting), Levenberg–Marquardt
 * refinement, k-fold cross-validation and BIC.
 */
import { compile, equation, paramNames } from "./grammar";
import { ols } from "./linalg";
import { levenbergMarquardt } from "./lm";
import { createRng } from "./rng";
import { mean, quantile } from "./stats";
import type { FitResult, HypothesisForm, Inputs, Observation, OutputSpec, ShapeId, Term } from "./types";

export interface Dataset {
  vars: string[];
  X: number[][];
  y: number[];
  /** Analyse residuals on a log scale (positive data spanning orders of magnitude). */
  logResponse: boolean;
}

export function toDataset(observations: readonly Observation[], vars: readonly string[], logResponse?: boolean): Dataset {
  const X = observations.map((o) => vars.map((v) => o.inputs[v]));
  const y = observations.map((o) => o.output);
  return { vars: [...vars], X, y, logResponse: logResponse ?? shouldUseLogResponse(y) };
}

export function shouldUseLogResponse(y: readonly number[]): boolean {
  if (y.length < 4 || y.some((v) => !(v > 0))) return false;
  const lo = Math.min(...y);
  const hi = Math.max(...y);
  return hi / lo > 50;
}

const TINY = 1e-300;
const transform = (v: number, log: boolean) => (log ? Math.log(Math.max(v, TINY)) : v);

interface Contribution {
  params: number[];
  offset: number;
  contrib: number[];
}

function range(xs: number[]) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of xs) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return { lo, hi, span: Math.max(hi - lo, 1e-9) };
}

/** Fit r ≈ c + b·f(x) for a fixed basis f, returning SSE. */
function fitBasis(f: number[], r: number[]) {
  const coef = ols(
    f.map((v) => [1, v]),
    r,
  );
  if (!coef) return null;
  let sse = 0;
  for (let i = 0; i < r.length; i++) sse += (r[i] - coef[0] - coef[1] * f[i]) ** 2;
  return { c: coef[0], b: coef[1], sse };
}

function bestOverGrid(
  x: number[],
  r: number[],
  grid: number[][],
  basis: (x: number, g: number[]) => number,
): { g: number[]; c: number; b: number; sse: number } | null {
  let best: { g: number[]; c: number; b: number; sse: number } | null = null;
  for (const g of grid) {
    const f = x.map((xi) => basis(xi, g));
    if (f.some((v) => !Number.isFinite(v))) continue;
    const res = fitBasis(f, r);
    if (res && (!best || res.sse < best.sse)) best = { g, ...res };
  }
  return best;
}

const POWER_GRID = [-3, -2, -1.5, -1, -0.5, -0.25, 0.25, 0.5, 1, 1.5, 2, 3];

function satGrid(x: number[]) {
  const qs = [0.05, 0.15, 0.3, 0.5, 0.8].map((q) => Math.max(quantile(x, q), 1e-6));
  return qs.flatMap((K) => [1, 2, 4].map((n) => [K, n]));
}

function peakGrid(x: number[]) {
  const { lo, span } = range(x);
  const out: number[][] = [];
  for (let i = 0; i <= 10; i++) {
    for (const s of [0.08, 0.15, 0.3, 0.6]) out.push([lo + (span * i) / 10, span * s]);
  }
  return out;
}

const sat = (x: number, K: number, n: number) => {
  const xn = Math.pow(Math.max(x, 0), n);
  return xn / (Math.pow(K, n) + xn);
};
const gauss = (x: number, mu: number, s: number) => Math.exp(-0.5 * ((x - mu) / s) ** 2);

/** Initial parameters for one additive term fitted to residual r. */
function initSumTerm(shape: ShapeId, x: number[], r: number[]): Contribution {
  const zero = { params: [] as number[], offset: 0, contrib: r.map(() => 0) };
  const { span } = range(x);
  switch (shape) {
    case "linear": {
      const res = fitBasis(x, r);
      if (!res) return { ...zero, params: [0] };
      return { params: [res.b], offset: res.c, contrib: x.map((v) => res.b * v) };
    }
    case "quadratic": {
      const coef = ols(
        x.map((v) => [1, v, v * v]),
        r,
      );
      if (!coef) return { ...zero, params: [0, 0] };
      return { params: [coef[1], coef[2]], offset: coef[0], contrib: x.map((v) => coef[1] * v + coef[2] * v * v) };
    }
    case "log": {
      const res = fitBasis(
        x.map((v) => Math.log(Math.max(v, TINY))),
        r,
      );
      if (!res) return { ...zero, params: [0] };
      return { params: [res.b], offset: res.c, contrib: x.map((v) => res.b * Math.log(Math.max(v, TINY))) };
    }
    case "power": {
      const best = bestOverGrid(
        x,
        r,
        POWER_GRID.map((p) => [p]),
        (v, [p]) => Math.pow(v, p),
      );
      if (!best) return { ...zero, params: [0, 1] };
      return { params: [best.b, best.g[0]], offset: best.c, contrib: x.map((v) => best.b * Math.pow(v, best.g[0])) };
    }
    case "exp": {
      const grid = [-4, -2, -1, -0.5, -0.25, 0.25, 0.5, 1, 2, 4].map((k) => [k / span]);
      const best = bestOverGrid(x, r, grid, (v, [k]) => Math.exp(k * v));
      if (!best) return { ...zero, params: [0, 0] };
      return { params: [best.b, best.g[0]], offset: best.c, contrib: x.map((v) => best.b * Math.exp(best.g[0] * v)) };
    }
    case "saturating": {
      const best = bestOverGrid(x, r, satGrid(x), (v, [K, n]) => sat(v, K, n));
      if (!best) return { ...zero, params: [0, 1, 1] };
      const [K, n] = best.g;
      return { params: [best.b, K, n], offset: best.c, contrib: x.map((v) => best.b * sat(v, K, n)) };
    }
    case "peak": {
      const best = bestOverGrid(x, r, peakGrid(x), (v, [mu, s]) => gauss(v, mu, s));
      if (!best) return { ...zero, params: [0, mean(x), span / 2] };
      const [mu, s] = best.g;
      return { params: [best.b, mu, s], offset: best.c, contrib: x.map((v) => best.b * gauss(v, mu, s)) };
    }
  }
}

/** Initial (log-space) parameters for one multiplicative factor fitted to log-residual z. */
function initProductFactor(shape: ShapeId, x: number[], z: number[]): Contribution {
  const { lo, span } = range(x);
  const none = (params: number[]) => ({ params, offset: 0, contrib: z.map(() => 0) });
  const positive = x.every((v) => v > 0);
  switch (shape) {
    case "linear":
      return positive ? { params: [], offset: 0, contrib: x.map((v) => Math.log(v)) } : none([]);
    case "power": {
      if (!positive) return none([1]);
      const res = fitBasis(
        x.map((v) => Math.log(v)),
        z,
      );
      if (!res) return none([1]);
      return { params: [res.b], offset: res.c, contrib: x.map((v) => res.b * Math.log(v)) };
    }
    case "exp": {
      const res = fitBasis(x, z);
      if (!res) return none([0]);
      return { params: [res.b], offset: res.c, contrib: x.map((v) => res.b * v) };
    }
    case "peak": {
      const coef = ols(
        x.map((v) => [1, v, v * v]),
        z,
      );
      let mu = lo + span / 2;
      let s = span / 2;
      if (coef && coef[2] < 0) {
        mu = Math.min(Math.max(-coef[1] / (2 * coef[2]), lo - span), lo + 2 * span);
        s = Math.sqrt(-1 / (2 * coef[2]));
      }
      return { params: [mu, s], offset: 0, contrib: x.map((v) => -0.5 * ((v - mu) / s) ** 2) };
    }
    case "saturating": {
      let best: { K: number; n: number; sse: number } | null = null;
      for (const [K, n] of satGrid(x)) {
        const g = x.map((v) => Math.log(Math.max(sat(v, K, n), TINY)));
        const resid = z.map((zi, i) => zi - g[i]);
        const m = mean(resid);
        const sse = resid.reduce((a, v) => a + (v - m) ** 2, 0);
        if (Number.isFinite(sse) && (!best || sse < best.sse)) best = { K, n, sse };
      }
      if (!best) return none([Math.max(quantile(x, 0.5), 1e-6), 1]);
      const { K, n } = best;
      return { params: [K, n], offset: 0, contrib: x.map((v) => Math.log(Math.max(sat(v, K, n), TINY))) };
    }
    default:
      return none([]);
  }
}

function column(ds: Dataset, variable: string) {
  const j = ds.vars.indexOf(variable);
  return ds.X.map((row) => row[j]);
}

export function initParams(form: HypothesisForm, ds: Dataset): number[] {
  const y = ds.y;
  if (form.combine === "sum") {
    let r = y.map((v) => v - mean(y));
    let b0 = mean(y);
    const params: number[] = [];
    for (const t of form.terms) {
      const c = initSumTerm(t.shape, column(ds, t.variable), r);
      params.push(...c.params);
      b0 += c.offset;
      r = r.map((v, i) => v - c.offset - c.contrib[i]);
    }
    return [b0, ...params];
  }
  // product — initialise in log space; tolerate a few zero readings by flooring them.
  const top = Math.max(...y);
  if (y.every((v) => v >= 0) && top > 0 && y.filter((v) => v > 0).length >= 0.7 * y.length) {
    const floor = 0.01 * top;
    const z = y.map((v) => Math.log(Math.max(v, floor)));
    let r = z.slice();
    const params: number[] = [];
    for (const t of form.terms) {
      const c = initProductFactor(t.shape, column(ds, t.variable), r);
      params.push(...c.params);
      r = r.map((v, i) => v - c.contrib[i]);
    }
    return [Math.exp(mean(r)), ...params];
  }
  const params: number[] = [];
  const factors = form.terms.map((t: Term) => {
    const x = column(ds, t.variable);
    const { lo, span } = range(x);
    switch (t.shape) {
      case "power":
        params.push(1);
        return x.map((v) => v);
      case "exp":
        params.push(0);
        return x.map(() => 1);
      case "saturating":
        params.push(Math.max(quantile(x, 0.5), 1e-6), 1);
        return x.map((v) => sat(v, Math.max(quantile(x, 0.5), 1e-6), 1));
      case "peak":
        params.push(lo + span / 2, span / 2);
        return x.map((v) => gauss(v, lo + span / 2, span / 2));
      default:
        return x;
    }
  });
  const prod = y.map((_, i) => factors.reduce((a, f) => a * f[i], 1));
  const denom = mean(prod);
  return [denom !== 0 ? mean(y) / denom : mean(y), ...params];
}

export interface FitOptions {
  cv?: boolean;
  folds?: number;
  seed?: number;
  restarts?: number;
  /** Parameters from a previous fit — fits evolve smoothly as data accumulates. */
  warmStart?: number[];
}

function makePredict(form: HypothesisForm, ds: Dataset, rows: number[][]) {
  const f = compile(form, ds.vars);
  return (theta: number[]) => rows.map((x) => transform(f(theta, x), ds.logResponse));
}

export function fitForm(
  form: HypothesisForm,
  ds: Dataset,
  output: OutputSpec,
  { cv = true, folds = 5, seed = 1, restarts = 2, warmStart }: FitOptions = {},
): FitResult {
  const names = paramNames(form);
  const k = names.length;
  const n = ds.y.length;
  const yt = ds.y.map((v) => transform(v, ds.logResponse));
  const fail = (reason: string): FitResult => ({
    ok: false,
    params: new Array(k).fill(NaN),
    paramNames: names,
    stderr: new Array(k).fill(NaN),
    sse: Infinity,
    rmse: Infinity,
    r2: -Infinity,
    cvR2: -Infinity,
    bic: Infinity,
    k,
    n,
    equation: reason,
  });
  if (n < k + 2) return fail("insufficient data");

  const predict = makePredict(form, ds, ds.X);
  const theta0 = initParams(form, ds);
  let best = levenbergMarquardt(predict, yt, theta0);
  if (warmStart && warmStart.length === k && warmStart.every(Number.isFinite)) {
    const warm = levenbergMarquardt(predict, yt, warmStart);
    if (warm.sse < best.sse) best = warm;
  }

  const rng = createRng(seed);
  for (let r = 0; r < restarts; r++) {
    const start = best.params.map((p, j) => (j === 0 ? p : p * (1 + 0.35 * rng.normal())));
    const alt = levenbergMarquardt(predict, yt, start);
    if (alt.sse < best.sse * (1 - 1e-9)) best = alt;
  }
  if (!Number.isFinite(best.sse)) return fail("fit diverged");

  const mY = mean(yt);
  const sst = yt.reduce((a, v) => a + (v - mY) ** 2, 0) || 1e-300;
  const r2 = 1 - best.sse / sst;
  const bic = n * Math.log(Math.max(best.sse / n, TINY)) + k * Math.log(n);

  let cvR2 = r2;
  if (cv) {
    const kf = Math.min(folds, n);
    const order = createRng(seed ^ 0x5bd1e995).shuffle(ds.y.map((_, i) => i));
    let press = 0;
    for (let f = 0; f < kf; f++) {
      const test = order.filter((_, i) => i % kf === f);
      const testSet = new Set(test);
      const train = order.filter((i) => !testSet.has(i));
      if (train.length < k + 1) {
        press = Infinity;
        break;
      }
      const trX = train.map((i) => ds.X[i]);
      const trY = train.map((i) => yt[i]);
      const pTrain = makePredict(form, ds, trX);
      const sub = levenbergMarquardt(pTrain, trY, best.params, { maxIter: 40 });
      const pTest = makePredict(
        form,
        ds,
        test.map((i) => ds.X[i]),
      )(sub.params);
      test.forEach((i, j) => {
        const e = yt[i] - pTest[j];
        press += Number.isFinite(e) ? e * e : Infinity;
      });
    }
    cvR2 = Number.isFinite(press) ? 1 - press / sst : -Infinity;
  }

  return {
    ok: true,
    params: best.params,
    paramNames: names,
    stderr: best.stderr,
    sse: best.sse,
    rmse: Math.sqrt(best.sse / n),
    r2,
    cvR2,
    bic,
    k,
    n,
    equation: equation(form, best.params, output),
  };
}

/** Predict the raw output for a single setting of the inputs. */
export function predictForm(form: HypothesisForm, theta: number[], inputs: Inputs): number {
  const vars = form.terms.map((t) => t.variable);
  const f = compile(form, vars);
  return f(
    theta,
    vars.map((v) => inputs[v]),
  );
}
