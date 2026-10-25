/**
 * The built-in Theorist. No LLM required: it reasons from marginal scans, ablations and
 * residual audits, and evolves the leading hypotheses like a symbolic-regression search.
 */
import { fitForm, toDataset } from "../fit";
import { formKey, formLabel, PRODUCT_SHAPES, SHAPE_INFO, fmt, validateForm } from "../grammar";
import type { HypothesisSeed } from "../hypotheses";
import type { Hypothesis, HypothesisForm, Lab, ShapeId, Term } from "../types";
import type { DiscoveryAgent, MarginalEffect, TheoristContext, TheoristProposal } from "./types";

const SUM_SCAN: ShapeId[] = ["linear", "quadratic", "log", "power", "exp", "saturating", "peak"];
const PRODUCT_SCAN: ShapeId[] = ["power", "exp", "saturating", "peak"];

export function marginalScan(ctx: Pick<TheoristContext, "lab" | "observations" | "logResponse" | "seed">): MarginalEffect[] {
  const { lab } = ctx;
  const ds = toDataset(ctx.observations, lab.variables.map((v) => v.name), ctx.logResponse);
  const positiveY = ds.y.every((v) => v >= 0) && ds.y.some((v) => v > 0);
  return lab.variables
    .map((v) => {
      let bestSum: { shape: ShapeId; bic: number; r2: number } | null = null;
      let bestProd: { shape: ShapeId; bic: number; r2: number } | null = null;
      for (const shape of SUM_SCAN) {
        const form: HypothesisForm = { combine: "sum", terms: [{ variable: v.name, shape }] };
        if (validateForm(form, lab.variables)) continue;
        const f = fitForm(form, ds, lab.output, { cv: false, restarts: 0, seed: ctx.seed });
        if (f.ok && (!bestSum || f.bic < bestSum.bic)) bestSum = { shape, bic: f.bic, r2: f.r2 };
      }
      if (positiveY) {
        for (const shape of PRODUCT_SCAN) {
          const form: HypothesisForm = { combine: "product", terms: [{ variable: v.name, shape }] };
          if (validateForm(form, lab.variables)) continue;
          const f = fitForm(form, ds, lab.output, { cv: false, restarts: 0, seed: ctx.seed });
          if (f.ok && (!bestProd || f.bic < bestProd.bic)) bestProd = { shape, bic: f.bic, r2: f.r2 };
        }
      }
      const r2 = Math.max(bestSum?.r2 ?? 0, bestProd?.r2 ?? 0, 0);
      return {
        variable: v.name,
        r2,
        bestSumShape: bestSum?.shape ?? "linear",
        bestProductShape: bestProd?.shape,
      };
    })
    .sort((a, b) => b.r2 - a.r2);
}

function productShapeFor(m: MarginalEffect | undefined, lab: Lab, variable: string): ShapeId {
  if (m?.bestProductShape) return m.bestProductShape;
  const v = lab.variables.find((x) => x.name === variable)!;
  const s = m?.bestSumShape ?? "power";
  if (PRODUCT_SHAPES.includes(s)) return s === "power" && v.min <= 0 ? "exp" : s;
  if (s === "quadratic") return "peak";
  return v.min > 0 ? "power" : "exp";
}

export class HeuristicTheorist implements DiscoveryAgent {
  readonly name = "Built-in theorist";

  async propose(ctx: TheoristContext): Promise<TheoristProposal> {
    const { lab } = ctx;
    const label = (n: string) => lab.variables.find((v) => v.name === n)?.label ?? n;

    if (ctx.observations.length === 0) {
      const seeds: HypothesisSeed[] = [
        {
          form: { combine: "sum", terms: [] },
          origin: "screening",
          rationale: "Null hypothesis: nothing we control matters. Every real effect must beat this.",
        },
        ...lab.variables.map((v) => ({
          form: { combine: "sum" as const, terms: [{ variable: v.name, shape: "linear" as ShapeId }] },
          origin: "screening" as const,
          rationale: `Naive first guess: ${lab.output.label} responds linearly to ${v.label}.`,
        })),
        {
          form: { combine: "sum", terms: lab.variables.map((v) => ({ variable: v.name, shape: "linear" as ShapeId })) },
          origin: "screening",
          rationale: "Kitchen-sink linear model: all variables, additive, no curvature.",
        },
      ];
      return {
        author: "Theorist",
        notebook: [
          `No data yet. Opening with deliberately naive hypotheses — the null model plus linear effects of ${lab.variables
            .map((v) => v.label)
            .join(", ")} — so the first screening sweep has something concrete to falsify.`,
        ],
        hypotheses: seeds,
      };
    }

    const marg = marginalScan(ctx);
    const byVar = new Map(marg.map((m) => [m.variable, m]));
    const notebook: string[] = [];
    notebook.push(
      `Marginal scan over ${ctx.observations.length} observations: ` +
        marg
          .map(
            (m) =>
              `${label(m.variable)} alone explains ${fmt(m.r2 * 100, 2)}% (best shape: ${SHAPE_INFO[m.bestProductShape ?? m.bestSumShape].name})`,
          )
          .join("; ") +
        ".",
    );

    const liveKeys = new Set(ctx.hypotheses.filter((h) => h.status !== "refuted").map((h) => h.key));
    const allKeys = new Set(ctx.hypotheses.map((h) => h.key));
    const reopenable = new Set(
      ctx.hypotheses.filter((h) => h.status === "refuted" && !h.verdict?.startsWith("Falsified")).map((h) => h.key),
    );
    const live = ctx.hypotheses.filter((h) => h.status !== "refuted" && h.fit?.ok).sort((a, b) => b.weight - a.weight);
    const leader: Hypothesis | undefined = live.find((h) => h.id === ctx.bestId) ?? live[0];
    const imp = new Map(ctx.importance.map((i) => [i.variable, i]));

    const relevant = marg
      .filter(
        (m) =>
          m.r2 >= 0.03 ||
          imp.get(m.variable)?.verdict === "essential" ||
          ctx.anomalies.some((a) => a.variable === m.variable),
      )
      .map((m) => m.variable);
    if (!relevant.length) relevant.push(marg[0].variable);
    const order = lab.variables.map((v) => v.name);
    const relevantSorted = [...relevant].sort((a, b) => order.indexOf(a) - order.indexOf(b));

    const out: HypothesisSeed[] = [];
    const push = (seed: HypothesisSeed) => {
      if (validateForm(seed.form, lab.variables)) return;
      const key = formKey(seed.form);
      if (liveKeys.has(key)) return;
      if (allKeys.has(key) && !(seed.revive && reopenable.has(key))) return;
      liveKeys.add(key);
      allKeys.add(key);
      out.push(seed);
    };
    // Multiplicative laws only make sense for non-negative responses.
    const positiveY = ctx.observations.every((o) => o.output >= 0) && ctx.observations.some((o) => o.output > 0);

    const shapeFor = (variable: string, combine: HypothesisForm["combine"]): ShapeId =>
      combine === "product" ? productShapeFor(byVar.get(variable), lab, variable) : byVar.get(variable)?.bestSumShape ?? "linear";

    // 1. Residual-driven repairs of the leader.
    if (leader) {
      for (const a of ctx.anomalies) {
        const inLeader = leader.form.terms.find((t) => t.variable === a.variable);
        const combine = leader.form.combine;
        const shapes: ShapeId[] = inLeader
          ? (a.shape === "peak" ? (["peak", "saturating", "quadratic"] as ShapeId[]) : (["power", "exp", "saturating"] as ShapeId[])).filter(
              (s) => s !== inLeader.shape,
            )
          : [a.shape === "peak" ? "peak" : shapeFor(a.variable, combine)];
        for (const shape of shapes) {
          const terms: Term[] = inLeader
            ? leader.form.terms.map((t) => (t.variable === a.variable ? { variable: t.variable, shape } : t))
            : [...leader.form.terms, { variable: a.variable, shape }];
          push({
            form: { combine, terms },
            origin: "residual",
            parentId: leader.id,
            revive: true,
            rationale: `${a.message} Repairing ${leader.id} with a ${SHAPE_INFO[shape].name} dependence on ${label(a.variable)}.`,
          });
        }
      }
    }

    // 2. Ablation-driven: add variables the leader is missing, drop ones it doesn't need.
    if (leader) {
      for (const i of ctx.importance) {
        if (!i.inBest && i.verdict === "essential") {
          const shape = shapeFor(i.variable, leader.form.combine);
          push({
            form: { combine: leader.form.combine, terms: [...leader.form.terms, { variable: i.variable, shape }] },
            origin: "mutation",
            parentId: leader.id,
            revive: true,
            rationale: `Adding ${label(i.variable)} to ${leader.id} would improve BIC by ${fmt(i.deltaBic, 3)} — the leader is missing an effect.`,
          });
        }
        if (i.inBest && i.verdict !== "essential" && leader.form.terms.length > 1) {
          push({
            form: { ...leader.form, terms: leader.form.terms.filter((t) => t.variable !== i.variable) },
            origin: "mutation",
            parentId: leader.id,
            revive: true,
            rationale: `Ablation: removing ${label(i.variable)} from ${leader.id} costs little (ΔBIC ${fmt(i.deltaBic, 2)}). Occam says the simpler law deserves a fair fight.`,
          });
        }
      }
    }

    // 3. Compositional hypotheses over the relevant variables.
    const top = relevantSorted.slice(0, 4);
    if (positiveY && top.every((v) => lab.variables.find((x) => x.name === v)!.min > 0)) {
      push({
        form: { combine: "product", terms: top.map((v) => ({ variable: v, shape: "power" as ShapeId })) },
        origin: "theorist",
        rationale: `Scaling-law conjecture: ${lab.output.label} ∝ ${top.map((v) => `${v}^p`).join(" · ")}. Power laws are the most common form of physical and economic laws.`,
      });
    }
    if (positiveY) {
      push({
        form: { combine: "product", terms: top.map((v) => ({ variable: v, shape: shapeFor(v, "product") })) },
        origin: "theorist",
        rationale: `Separable multiplicative model built from each variable's best marginal shape: ${top
          .map((v) => `${SHAPE_INFO[shapeFor(v, "product")].name} in ${label(v)}`)
          .join(", ")}.`,
      });
    }
    push({
      form: { combine: "sum", terms: top.map((v) => ({ variable: v, shape: shapeFor(v, "sum") })) },
      origin: "theorist",
      rationale: `Additive model from the marginal shapes — tests whether the effects of ${top.map(label).join(", ")} simply add up.`,
    });

    // 4. Evolve the two strongest hypotheses (shape swaps, mode switch).
    for (const parent of live.slice(0, 2)) {
      for (const t of parent.form.terms) {
        const alts: ShapeId[] = (parent.form.combine === "product" ? PRODUCT_SCAN : (["power", "quadratic", "saturating", "peak", "exp"] as ShapeId[])).filter(
          (s) => s !== t.shape,
        );
        for (const shape of alts.slice(0, 2)) {
          push({
            form: { ...parent.form, terms: parent.form.terms.map((x) => (x === t ? { variable: t.variable, shape } : x)) },
            origin: "mutation",
            parentId: parent.id,
            rationale: `Mutation of ${parent.id} (${parent.label}): what if ${label(t.variable)} acts as a ${SHAPE_INFO[shape].name} instead of ${SHAPE_INFO[t.shape].name}?`,
          });
        }
      }
      if (positiveY && parent.form.combine === "sum" && parent.form.terms.length > 1) {
        push({
          form: {
            combine: "product",
            terms: parent.form.terms.map((t) => ({ variable: t.variable, shape: PRODUCT_SHAPES.includes(t.shape) ? t.shape : shapeFor(t.variable, "product") })),
          },
          origin: "mutation",
          parentId: parent.id,
          rationale: `Do the effects in ${parent.id} multiply rather than add? Interactions are the rule in nature.`,
        });
      }
    }

    // 5. Strong single-variable laws.
    for (const v of relevantSorted.slice(0, 2)) {
      push({
        form: { combine: positiveY ? "product" : "sum", terms: [{ variable: v, shape: shapeFor(v, positiveY ? "product" : "sum") }] },
        origin: "theorist",
        rationale: `${label(v)} carries most of the signal on its own — is it the whole story?`,
      });
    }

    // Consolidation: once a leader is well supported, challengers must earn their place —
    // fewer of them, and a sceptical prior (they are perturbations of a winning theory).
    const strong = !!leader && leader.weight >= 0.7 && (leader.fit?.cvR2 ?? 0) >= 0.95 && ctx.anomalies.length === 0;
    const chosen = out.slice(0, strong ? Math.min(2, ctx.maxNew) : ctx.maxNew);
    if (strong) {
      for (const c of chosen) if (c.origin === "mutation" || c.origin === "theorist") c.prior = 0.5;
      notebook.push(`Leader is strong — switching to consolidation: only the ${chosen.length} most plausible challenger(s), with a sceptical prior.`);
    }
    if (leader) {
      notebook.push(
        `Current leader ${leader.id} (${leader.label}) holds p=${fmt(leader.weight, 2)}, out-of-sample R²=${fmt(leader.fit!.cvR2, 3)}. ` +
          (chosen.length
            ? `Proposing ${chosen.length} challenger${chosen.length > 1 ? "s" : ""}: ${chosen.map((s) => formLabel(s.form)).join(" | ")}.`
            : "No new challengers worth testing — focusing experiments on the existing rivals."),
      );
    }
    return { author: "Theorist", notebook, hypotheses: chosen };
  }
}
