/** Tiny scale + tick helpers for hand-rolled SVG charts. */
export interface Scale {
  (v: number): number;
  ticks: number[];
  format: (v: number) => string;
  domain: [number, number];
}

const niceStep = (span: number, count: number) => {
  const raw = span / Math.max(count, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
};

const short = (v: number) => {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e4 || a < 1e-2) return v.toExponential(0).replace("e+", "e");
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return Number(v.toFixed(2)).toString();
  return Number(v.toPrecision(2)).toString();
};

export function linearScale(d0: number, d1: number, r0: number, r1: number, count = 5): Scale {
  if (d1 - d0 < 1e-12) {
    d0 -= 0.5;
    d1 += 0.5;
  }
  const step = niceStep(d1 - d0, count);
  const ticks: number[] = [];
  for (let t = Math.ceil(d0 / step) * step; t <= d1 + 1e-9; t += step) ticks.push(Number(t.toPrecision(12)));
  const s = ((v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)) as Scale;
  s.ticks = ticks;
  s.format = short;
  s.domain = [d0, d1];
  return s;
}

/** Log10 scale on positive values; ticks at decades (and 2,5 multiples when the span is short). */
export function logScale(d0: number, d1: number, r0: number, r1: number): Scale {
  const l0 = Math.log10(Math.max(d0, 1e-300));
  const l1 = Math.log10(Math.max(d1, d0 * 1.0001));
  const ticks: number[] = [];
  const span = l1 - l0;
  for (let e = Math.floor(l0); e <= Math.ceil(l1); e++) {
    for (const m of span < 2.5 ? [1, 2, 5] : [1]) {
      const v = m * Math.pow(10, e);
      if (v >= d0 * 0.999 && v <= d1 * 1.001) ticks.push(v);
    }
  }
  const s = ((v: number) => r0 + ((Math.log10(Math.max(v, 1e-300)) - l0) / (l1 - l0 || 1)) * (r1 - r0)) as Scale;
  s.ticks = ticks;
  s.format = short;
  s.domain = [d0, d1];
  return s;
}
