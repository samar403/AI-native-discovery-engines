/**
 * The hypothesis grammar: a small symbolic-regression language.
 *
 *   sum:      y = b0 + Σ g_k(x_k)        g ∈ {linear, quadratic, log, power, exp, saturating, peak}
 *   product:  y = A · Π h_k(x_k)         h ∈ {linear, power, exp, saturating, peak}
 *
 * Every hypothesis the engine (or Claude) proposes must be expressible here, which is
 * what makes it falsifiable: it can be fitted, cross-validated and compared.
 */
import type { HypothesisForm, OutputSpec, ShapeId, Term, Variable } from "./types";

export const ALL_SHAPES: ShapeId[] = ["linear", "quadratic", "log", "power", "exp", "saturating", "peak"];
export const PRODUCT_SHAPES: ShapeId[] = ["linear", "power", "exp", "saturating", "peak"];
export const MAX_TERMS = 4;

export const SHAPE_INFO: Record<ShapeId, { name: string; glyph: string; describe: string }> = {
  linear: { name: "linear", glyph: "x", describe: "varies linearly with" },
  quadratic: { name: "quadratic", glyph: "x²", describe: "depends quadratically on" },
  log: { name: "logarithmic", glyph: "ln x", describe: "grows logarithmically with" },
  power: { name: "power law", glyph: "xᵖ", describe: "follows a power law in" },
  exp: { name: "exponential", glyph: "eˣ", describe: "changes exponentially with" },
  saturating: { name: "saturating", glyph: "sat", describe: "saturates with increasing" },
  peak: { name: "optimum", glyph: "∩", describe: "has an optimum in" },
};

/** Parameter names contributed by one term (sum mode includes an amplitude). */
export function termParamNames(term: Term, combine: HypothesisForm["combine"]): string[] {
  const v = term.variable;
  const amp = combine === "sum";
  switch (term.shape) {
    case "linear":
      return amp ? [`${v}.b`] : [];
    case "quadratic":
      return [`${v}.b1`, `${v}.b2`];
    case "log":
      return [`${v}.b`];
    case "power":
      return amp ? [`${v}.b`, `${v}.p`] : [`${v}.p`];
    case "exp":
      return amp ? [`${v}.b`, `${v}.k`] : [`${v}.k`];
    case "saturating":
      return amp ? [`${v}.b`, `${v}.K`, `${v}.n`] : [`${v}.K`, `${v}.n`];
    case "peak":
      return amp ? [`${v}.b`, `${v}.mu`, `${v}.s`] : [`${v}.mu`, `${v}.s`];
  }
}

export function paramNames(form: HypothesisForm): string[] {
  const head = form.combine === "sum" ? "b0" : "A";
  return [head, ...form.terms.flatMap((t) => termParamNames(t, form.combine))];
}

const clampN = (n: number) => Math.min(Math.max(Math.abs(n), 0.2), 8);

/** Evaluate the shape (sum mode includes amplitude b as first param). */
function evalTerm(shape: ShapeId, x: number, p: number[], o: number, amp: boolean): number {
  const b = amp ? p[o] : 1;
  const q = amp ? o + 1 : o;
  switch (shape) {
    case "linear":
      return b * x;
    case "quadratic":
      return p[o] * x + p[o + 1] * x * x;
    case "log":
      return p[o] * Math.log(x);
    case "power":
      return b * Math.pow(x, p[q]);
    case "exp":
      return b * Math.exp(Math.max(Math.min(p[q] * x, 700), -700));
    case "saturating": {
      const K = Math.abs(p[q]) + 1e-12;
      const n = clampN(p[q + 1]);
      const xn = Math.pow(Math.max(x, 0), n);
      return (b * xn) / (Math.pow(K, n) + xn);
    }
    case "peak": {
      const mu = p[q];
      const s = Math.abs(p[q + 1]) + 1e-12;
      const z = (x - mu) / s;
      return b * Math.exp(-0.5 * z * z);
    }
  }
}

export type Compiled = (theta: number[], x: number[]) => number;

/**
 * Compile a form into a fast evaluator. `x` is the row of variable values in the
 * order of `variables` passed here.
 */
export function compile(form: HypothesisForm, variables: readonly string[]): Compiled {
  const amp = form.combine === "sum";
  const layout = form.terms.map((t) => ({
    shape: t.shape,
    idx: variables.indexOf(t.variable),
    width: termParamNames(t, form.combine).length,
  }));
  if (form.combine === "sum") {
    return (theta, x) => {
      let y = theta[0];
      let o = 1;
      for (const l of layout) {
        y += evalTerm(l.shape, x[l.idx], theta, o, amp);
        o += l.width;
      }
      return y;
    };
  }
  return (theta, x) => {
    let y = theta[0];
    let o = 1;
    for (const l of layout) {
      y *= evalTerm(l.shape, x[l.idx], theta, o, amp);
      o += l.width;
    }
    return y;
  };
}

export function formKey(form: HypothesisForm): string {
  if (form.terms.length === 0) return "null";
  const terms = form.terms
    .map((t) => `${t.variable}:${t.shape}`)
    .sort()
    .join(",");
  return `${form.combine}(${terms})`;
}

export function formLabel(form: HypothesisForm): string {
  if (form.terms.length === 0) return "∅ const";
  const parts = form.terms.map((t) => {
    switch (t.shape) {
      case "linear":
        return t.variable;
      case "quadratic":
        return `${t.variable}²`;
      case "log":
        return `ln ${t.variable}`;
      case "power":
        return `${t.variable}ᵖ`;
      case "exp":
        return `e^${t.variable}`;
      case "saturating":
        return `sat(${t.variable})`;
      case "peak":
        return `∩(${t.variable})`;
    }
  });
  return parts.join(form.combine === "sum" ? " + " : " · ");
}

export function describeForm(form: HypothesisForm, output: OutputSpec, variables: readonly Variable[]): string {
  const label = (name: string) => variables.find((v) => v.name === name)?.label ?? name;
  const out = output.label.charAt(0).toUpperCase() + output.label.slice(1);
  if (form.terms.length === 0) return `${out} does not depend on any controlled variable (null model).`;
  if (form.terms.length === 1) {
    const t = form.terms[0];
    const base = `${out} ${SHAPE_INFO[t.shape].describe} ${label(t.variable)}`;
    return form.combine === "product" ? `${base}, scaling proportionally (no offset).` : `${base}.`;
  }
  const pieces = form.terms.map((t) => `${SHAPE_INFO[t.shape].name} in ${label(t.variable)}`);
  const list = pieces.slice(0, -1).join(", ") + " and " + pieces[pieces.length - 1];
  return form.combine === "product"
    ? `${out} is a product of independent factors: ${list}.`
    : `${out} is an additive combination: ${list}.`;
}

export function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(digits - 1).replace("e+", "e");
  const s = v.toPrecision(digits);
  return s.includes("e") ? Number(s).toString() : s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

/** R² near 1 is where the interesting differences are — never round it up to "1". */
export function fmtR2(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 0.99995) return ">0.9999";
  return v.toFixed(4);
}

const sup = (v: number) => {
  const s = fmt(v);
  return s.startsWith("-") ? `^(${s})` : `^${s}`;
};

/** Human-readable fitted equation. */
export function equation(form: HypothesisForm, theta: readonly number[], output: OutputSpec): string {
  const lhs = output.name;
  if (form.terms.length === 0) return `${lhs} = ${fmt(theta[0])}`;
  let o = 1;
  const amp = form.combine === "sum";
  const pieces: string[] = [];
  for (const t of form.terms) {
    const w = termParamNames(t, form.combine).length;
    const p = theta.slice(o, o + w);
    o += w;
    const x = t.variable;
    const b = amp ? fmt(p[0]) : "";
    const q = amp ? p.slice(1) : p;
    const pre = amp ? `${b}·` : "";
    switch (t.shape) {
      case "linear":
        pieces.push(amp ? `${b}·${x}` : x);
        break;
      case "quadratic":
        pieces.push(`(${fmt(p[0])}·${x} ${p[1] < 0 ? "−" : "+"} ${fmt(Math.abs(p[1]))}·${x}²)`);
        break;
      case "log":
        pieces.push(`${fmt(p[0])}·ln ${x}`);
        break;
      case "power":
        pieces.push(`${pre}${x}${sup(q[0])}`);
        break;
      case "exp":
        pieces.push(`${pre}e^(${fmt(q[0])}·${x})`);
        break;
      case "saturating": {
        const n = clampN(q[1]);
        const K = Math.abs(q[0]);
        pieces.push(
          Math.abs(n - 1) < 0.05
            ? `${pre}${x}/(${fmt(K)} + ${x})`
            : `${pre}${x}${sup(n)}/(${fmt(K)}${sup(n)} + ${x}${sup(n)})`,
        );
        break;
      }
      case "peak":
        pieces.push(`${pre}exp(−½((${x} − ${fmt(q[0])})/${fmt(Math.abs(q[1]))})²)`);
        break;
    }
  }
  if (form.combine === "sum") {
    const head = Math.abs(theta[0]) < 1e-9 ? "" : `${fmt(theta[0])} + `;
    return `${lhs} = ${head}${pieces.join(" + ")}`.replace(/\+ -/g, "− ");
  }
  return `${lhs} = ${fmt(theta[0])} · ${pieces.join(" · ")}`;
}

/** Can this form be evaluated over the variable domain? */
export function validateForm(form: HypothesisForm, variables: readonly Variable[]): string | null {
  if (form.terms.length > MAX_TERMS) return `too many terms (max ${MAX_TERMS})`;
  const seen = new Set<string>();
  for (const t of form.terms) {
    const v = variables.find((vv) => vv.name === t.variable);
    if (!v) return `unknown variable "${t.variable}"`;
    if (seen.has(t.variable)) return `variable "${t.variable}" used twice`;
    seen.add(t.variable);
    if (!ALL_SHAPES.includes(t.shape)) return `unknown shape "${t.shape}"`;
    if (form.combine === "product" && !PRODUCT_SHAPES.includes(t.shape))
      return `shape "${t.shape}" is not allowed in product form`;
    if ((t.shape === "log" || t.shape === "power") && v.min <= 0) return `${t.shape} requires ${v.name} > 0`;
    if (form.combine === "product" && t.shape === "linear" && v.min < 0)
      return `proportional factor requires ${v.name} ≥ 0`;
  }
  return null;
}

export function paramCount(form: HypothesisForm): number {
  return paramNames(form).length;
}
