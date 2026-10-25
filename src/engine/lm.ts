import { inverse, solve, type Matrix } from "./linalg";

export interface LmResult {
  params: number[];
  sse: number;
  /** Parameter standard errors from the Gauss–Newton covariance σ²(JᵀJ)⁻¹ (NaN when undetermined). */
  stderr: number[];
  iterations: number;
  converged: boolean;
}

export interface LmOptions {
  maxIter?: number;
  tol?: number;
}

/**
 * Levenberg–Marquardt nonlinear least squares with a numeric Jacobian.
 * `predict(theta)` returns model predictions for every observation.
 */
export function levenbergMarquardt(
  predict: (theta: number[]) => number[],
  y: readonly number[],
  theta0: readonly number[],
  { maxIter = 120, tol = 1e-10 }: LmOptions = {},
): LmResult {
  const n = y.length;
  const p = theta0.length;
  const sseOf = (pred: number[]) => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const r = y[i] - pred[i];
      s += r * r;
    }
    return Number.isFinite(s) ? s : Infinity;
  };

  let theta = theta0.slice();
  let pred = predict(theta);
  let sse = sseOf(pred);

  if (p === 0) return { params: [], sse, stderr: [], iterations: 0, converged: true };

  let lambda = 1e-3;
  let iter = 0;
  let converged = false;
  let J: Matrix = [];

  const jacobian = (th: number[], base: number[]): Matrix => {
    const Jm: Matrix = Array.from({ length: n }, () => new Array<number>(p).fill(0));
    for (let j = 0; j < p; j++) {
      const h = 1e-6 * Math.max(Math.abs(th[j]), 1e-3);
      const t2 = th.slice();
      t2[j] += h;
      const p2 = predict(t2);
      for (let i = 0; i < n; i++) {
        const d = (p2[i] - base[i]) / h;
        Jm[i][j] = Number.isFinite(d) ? d : 0;
      }
    }
    return Jm;
  };

  if (!Number.isFinite(sse)) {
    return { params: theta, sse: Infinity, stderr: new Array(p).fill(NaN), iterations: 0, converged: false };
  }

  for (iter = 0; iter < maxIter; iter++) {
    J = jacobian(theta, pred);
    const JtJ: Matrix = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const Jtr = new Array<number>(p).fill(0);
    for (let i = 0; i < n; i++) {
      const r = y[i] - pred[i];
      const row = J[i];
      for (let a = 0; a < p; a++) {
        Jtr[a] += row[a] * r;
        for (let b = a; b < p; b++) JtJ[a][b] += row[a] * row[b];
      }
    }
    for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) JtJ[a][b] = JtJ[b][a];

    let improved = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v + lambda * (v + 1e-12) : v)));
      const delta = solve(A, Jtr);
      if (!delta) {
        lambda *= 10;
        continue;
      }
      const cand = theta.map((t, j) => t + delta[j]);
      const candPred = predict(cand);
      const candSse = sseOf(candPred);
      if (candSse < sse) {
        const rel = (sse - candSse) / Math.max(sse, 1e-300);
        theta = cand;
        pred = candPred;
        sse = candSse;
        lambda = Math.max(lambda / 3, 1e-12);
        improved = true;
        if (rel < tol) converged = true;
        break;
      }
      lambda *= 4;
      if (lambda > 1e12) break;
    }
    if (!improved || converged) {
      converged = true;
      break;
    }
  }

  // Standard errors from the final Jacobian.
  J = jacobian(theta, pred);
  const JtJ: Matrix = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) JtJ[a][b] += J[i][a] * J[i][b];
  }
  const dof = Math.max(n - p, 1);
  const sigma2 = sse / dof;
  const inv = n > p ? inverse(JtJ) : null;
  const stderr = inv ? inv.map((row, j) => Math.sqrt(Math.max(row[j] * sigma2, 0))) : new Array(p).fill(NaN);

  return { params: theta, sse, stderr, iterations: iter, converged };
}
