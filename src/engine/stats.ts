/** Descriptive and inferential statistics used by the Analyst. */

export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: readonly number[]) => (xs.length ? sum(xs) / xs.length : NaN);

export function variance(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1);
}

export const std = (xs: readonly number[]) => Math.sqrt(variance(xs));

export function quantile(xs: readonly number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function pearson(x: readonly number[], y: readonly number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

export function rSquared(y: readonly number[], yhat: readonly number[]): number {
  const m = mean(y);
  let ssr = 0;
  let sst = 0;
  for (let i = 0; i < y.length; i++) {
    ssr += (y[i] - yhat[i]) ** 2;
    sst += (y[i] - m) ** 2;
  }
  return sst === 0 ? 0 : 1 - ssr / sst;
}

/** Log-gamma via Lanczos approximation. */
export function lgamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Regularized incomplete beta function I_x(a, b) via continued fractions. */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const cf = (xx: number, aa: number, bb: number) => {
    const MAXIT = 200;
    const EPS = 3e-14;
    const FPMIN = 1e-300;
    const qab = aa + bb;
    const qap = aa + 1;
    const qam = aa - 1;
    let c = 1;
    let d = 1 - (qab * xx) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa2 = (m * (bb - m) * xx) / ((qam + m2) * (aa + m2));
      d = 1 + aa2 * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa2 / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa2 = (-(aa + m) * (qab + m) * xx) / ((aa + m2) * (qap + m2));
      d = 1 + aa2 * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa2 / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2) ? (bt * cf(x, a, b)) / a : 1 - (bt * cf(1 - x, b, a)) / b;
}

/** Two-sided p-value for a Student-t statistic with `df` degrees of freedom. */
export function tTestPValue(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** Significance of a Pearson correlation r over n samples. */
export function correlationPValue(r: number, n: number): number {
  if (n < 4) return 1;
  const rr = Math.min(0.999999, Math.abs(r));
  const t = (rr * Math.sqrt(n - 2)) / Math.sqrt(1 - rr * rr);
  return tTestPValue(t, n - 2);
}

/** Benjamini–Hochberg FDR adjustment. Returns adjusted p-values in input order. */
export function benjaminiHochberg(ps: readonly number[]): number[] {
  const n = ps.length;
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const adj = new Array<number>(n);
  let prev = 1;
  for (let k = n - 1; k >= 0; k--) {
    const v = Math.min(prev, (order[k].p * n) / (k + 1));
    adj[order[k].i] = v;
    prev = v;
  }
  return adj;
}
