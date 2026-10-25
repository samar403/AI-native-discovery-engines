/** Scoring against hidden ground truth, and the exportable lab report. */
import { fmt, SHAPE_INFO } from "./grammar";
import type { EngineSnapshot, Hypothesis, Lab, ShapeId } from "./types";

export interface TruthScore {
  score: number;
  precision: number;
  recall: number;
  shapes: { variable: string; truth: ShapeId; found?: ShapeId; ok: boolean }[];
  params: { name: string; truth: number; estimate: number; relErr: number }[];
  summary: string;
}

export function finalHypothesis(snap: EngineSnapshot): Hypothesis | undefined {
  const id = snap.discovery?.hypothesisId ?? snap.bestId;
  return snap.hypotheses.find((h) => h.id === id);
}

const equivalent = (a: ShapeId, b?: ShapeId) => !!b && (a === b || (a === "power" && b === "linear") || (a === "linear" && b === "power"));

export function scoreAgainstTruth(snap: EngineSnapshot, lab: Lab): TruthScore | undefined {
  const truth = lab.truth;
  const h = finalHypothesis(snap);
  if (!truth || !h?.fit?.ok) return undefined;
  const tVars = new Set(truth.form.terms.map((t) => t.variable));
  const fVars = new Set(h.form.terms.map((t) => t.variable));
  const optional = new Set(truth.optional ?? []);
  const hit = [...fVars].filter((v) => tVars.has(v)).length;
  const counted = [...fVars].filter((v) => !optional.has(v) || tVars.has(v)).length;
  const precision = counted ? hit / counted : tVars.size ? 0 : 1;
  const recall = tVars.size ? hit / tVars.size : 1;
  const shapes = truth.form.terms.map((t) => {
    const found = h.form.terms.find((x) => x.variable === t.variable)?.shape;
    return { variable: t.variable, truth: t.shape, found, ok: equivalent(t.shape, found) };
  });
  const params = Object.entries(truth.reference ?? {})
    .map(([name, tv]) => {
      const j = h.fit!.paramNames.indexOf(name);
      if (j < 0) return null;
      const est = name.endsWith(".K") || name.endsWith(".s") ? Math.abs(h.fit!.params[j]) : h.fit!.params[j];
      return { name, truth: tv, estimate: est, relErr: Math.abs(est - tv) / Math.max(Math.abs(tv), 1e-9) };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const shapeFrac = shapes.length ? shapes.filter((s) => s.ok).length / shapes.length : 1;
  const nRef = Object.keys(truth.reference ?? {}).length;
  const paramAcc = nRef
    ? params.reduce((a, p) => a + Math.max(0, 1 - Math.min(p.relErr, 1)), 0) / nRef
    : 1;
  const score = Math.round(100 * (0.45 * f1 + 0.3 * shapeFrac + 0.25 * paramAcc));
  const summary =
    `${score}/100 — variables ${hit}/${tVars.size} found${counted > hit ? ` (+${counted - hit} spurious)` : ""}, ` +
    `shapes ${shapes.filter((s) => s.ok).length}/${shapes.length} correct` +
    (params.length ? `, ${params.map((p) => `${p.name} ${fmt(p.estimate)} vs ${fmt(p.truth)}`).join(", ")}` : "");
  return { score, precision, recall, shapes, params, summary };
}

export function buildMarkdownReport(snap: EngineSnapshot, lab: Lab, narrative?: string): string {
  const h = finalHypothesis(snap);
  const label = (n: string) => lab.variables.find((v) => v.name === n)?.label ?? n;
  const lines: string[] = [];
  lines.push(`# Discovery report — ${lab.name}`);
  lines.push("");
  lines.push(`> ${lab.question}`);
  lines.push("");
  lines.push(
    `**Outcome:** ${snap.discovery ? "Law established" : "No law established"} · ${snap.observations.length}/${snap.budget} experiments · ${snap.cycle} cycles · seed ${snap.seed} · theorist: ${snap.agentName}`,
  );
  lines.push("");
  if (h?.fit?.ok) {
    lines.push("## Leading law");
    lines.push("");
    lines.push("```");
    lines.push(h.fit.equation);
    lines.push("```");
    lines.push("");
    lines.push(`${h.statement}`);
    lines.push("");
    lines.push(`| Metric | Value |\n|---|---|`);
    lines.push(`| Posterior probability | ${fmt(h.weight * 100, 3)}% |`);
    lines.push(`| Out-of-sample R² (5-fold CV) | ${fmt(h.fit.cvR2, 4)} |`);
    lines.push(`| In-sample R² | ${fmt(h.fit.r2, 4)} |`);
    lines.push(`| BIC | ${fmt(h.fit.bic, 4)} |`);
    lines.push(`| Parameters | ${h.fit.k} |`);
    lines.push("");
    lines.push("| Parameter | Estimate | ± SE |\n|---|---|---|");
    h.fit.paramNames.forEach((n, i) => lines.push(`| ${n} | ${fmt(h.fit!.params[i], 4)} | ${fmt(h.fit!.stderr[i], 2)} |`));
    lines.push("");
  }
  if (snap.discovery?.optimum) {
    const o = snap.discovery.optimum;
    lines.push(`## Predicted ${lab.objective === "maximize" ? "optimum" : "minimum"}`);
    lines.push("");
    lines.push(
      `${Object.entries(o.inputs)
        .map(([k, v]) => `${label(k)} = ${fmt(v)}`)
        .join(", ")} → ${lab.output.label} ≈ ${fmt(o.value)} ${lab.output.unit}`,
    );
    lines.push("");
  }
  if (snap.importance.length) {
    lines.push("## Variable ablation");
    lines.push("");
    lines.push("| Variable | In law | ΔBIC if removed/added | Verdict |\n|---|---|---|---|");
    for (const i of snap.importance) lines.push(`| ${label(i.variable)} | ${i.inBest ? "yes" : "no"} | ${fmt(i.deltaBic, 3)} | ${i.verdict} |`);
    lines.push("");
  }
  lines.push("## Hypotheses tested");
  lines.push("");
  lines.push("| ID | Form | Origin | Status | Posterior | CV R² | Verdict |\n|---|---|---|---|---|---|---|");
  for (const x of snap.hypotheses) {
    lines.push(
      `| ${x.id} | \`${x.label}\` | ${x.origin} | ${x.status} | ${fmt(x.weight, 2)} | ${x.fit?.ok ? fmt(x.fit.cvR2, 3) : "—"} | ${x.verdict ?? ""} |`,
    );
  }
  lines.push("");
  lines.push("## Experimental campaign");
  lines.push("");
  for (const d of snap.designs) lines.push(`- **Cycle ${d.cycle} · ${d.strategy}** (${d.points.length} runs): ${d.rationale}`);
  lines.push("");
  if (narrative) {
    lines.push("## Interpretation");
    lines.push("");
    lines.push(narrative);
    lines.push("");
  }
  const score = scoreAgainstTruth(snap, lab);
  if (lab.truth) {
    lines.push("## Ground truth (revealed after the run)");
    lines.push("");
    lines.push("```");
    lines.push(lab.truth.equation);
    lines.push("```");
    lines.push("");
    lines.push(lab.truth.summary);
    if (score) {
      lines.push("");
      lines.push(`**Truth match:** ${score.summary}`);
      lines.push("");
      for (const s of score.shapes)
        lines.push(`- ${label(s.variable)}: truth ${SHAPE_INFO[s.truth].name}, found ${s.found ? SHAPE_INFO[s.found].name : "—"} ${s.ok ? "✓" : "✗"}`);
    }
    lines.push("");
  }
  lines.push("## Lab notebook");
  lines.push("");
  for (const n of snap.notebook) lines.push(`- \`c${n.cycle}\` **${n.persona}** — ${n.text}`);
  lines.push("");
  lines.push("---");
  lines.push("_Generated by Eureka Engine — an AI-native discovery loop._");
  return lines.join("\n");
}
