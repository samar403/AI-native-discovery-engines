/** Wire format between the browser engine and the /api/agent route (Claude theorist). */
import { formKey, MAX_TERMS, PRODUCT_SHAPES, ALL_SHAPES } from "../grammar";
import type { HypothesisForm, ShapeId } from "../types";
import { marginalScan } from "./heuristic";
import type { TheoristContext } from "./types";

export interface ClaudeContext {
  lab: {
    name: string;
    field: string;
    question: string;
    description: string;
    objective?: string;
    output: { name: string; label: string; unit: string };
    variables: { name: string; label: string; unit: string; min: number; max: number }[];
  };
  grammar: {
    shapes: ShapeId[];
    productShapes: ShapeId[];
    maxTerms: number;
  };
  cycle: number;
  observationCount: number;
  responseScale: "linear" | "log";
  data: Record<string, number>[];
  marginal: { variable: string; varianceExplained: number; bestShape: string }[];
  leaderboard: {
    id: string;
    form: HypothesisForm;
    label: string;
    equation: string;
    posterior: number;
    cvR2: number;
    status: string;
  }[];
  refuted: { label: string; verdict: string }[];
  ablation: { variable: string; verdict: string; deltaBic: number; inLeader: boolean }[];
  anomalies: string[];
  existingKeys: string[];
  maxNew: number;
}

export interface ClaudeProposalResponse {
  notebook: string;
  hypotheses: {
    statement: string;
    rationale: string;
    combine: "sum" | "product";
    terms: { variable: string; shape: ShapeId }[];
    prior: number;
  }[];
  model?: string;
}

export interface ClaudeReportRequest {
  labName: string;
  question: string;
  summaryMarkdown: string;
}

const r4 = (v: number) => Number(v.toPrecision(4));

export function buildClaudeContext(ctx: TheoristContext): ClaudeContext {
  const { lab } = ctx;
  const live = ctx.hypotheses
    .filter((h) => h.status !== "refuted" && h.fit?.ok)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);
  const step = Math.max(1, Math.ceil(ctx.observations.length / 60));
  return {
    lab: {
      name: lab.name,
      field: lab.field,
      question: lab.question,
      description: lab.description,
      objective: lab.objective,
      output: lab.output,
      variables: lab.variables.map(({ name, label, unit, min, max }) => ({ name, label, unit, min, max })),
    },
    grammar: { shapes: ALL_SHAPES, productShapes: PRODUCT_SHAPES, maxTerms: MAX_TERMS },
    cycle: ctx.cycle,
    observationCount: ctx.observations.length,
    responseScale: ctx.logResponse ? "log" : "linear",
    data: ctx.observations
      .filter((_, i) => i % step === 0)
      .map((o) => ({ ...Object.fromEntries(Object.entries(o.inputs).map(([k, v]) => [k, r4(v)])), [lab.output.name]: r4(o.output) })),
    marginal: ctx.observations.length
      ? marginalScan(ctx).map((m) => ({
          variable: m.variable,
          varianceExplained: r4(m.r2),
          bestShape: m.bestProductShape ?? m.bestSumShape,
        }))
      : [],
    leaderboard: live.map((h) => ({
      id: h.id,
      form: h.form,
      label: h.label,
      equation: h.fit!.equation,
      posterior: r4(h.weight),
      cvR2: r4(h.fit!.cvR2),
      status: h.status,
    })),
    refuted: ctx.hypotheses
      .filter((h) => h.status === "refuted")
      .slice(-10)
      .map((h) => ({ label: h.label, verdict: h.verdict ?? "" })),
    ablation: ctx.importance.map((i) => ({
      variable: i.variable,
      verdict: i.verdict,
      deltaBic: r4(i.deltaBic),
      inLeader: i.inBest,
    })),
    anomalies: ctx.anomalies.map((a) => a.message),
    existingKeys: ctx.hypotheses.map((h) => h.key),
    maxNew: ctx.maxNew,
  };
}

export const proposalKey = (h: ClaudeProposalResponse["hypotheses"][number]) => formKey({ combine: h.combine, terms: h.terms });
