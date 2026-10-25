/**
 * The discovery loop:  propose → design → run → analyze → reflect → (repeat)
 *
 * `runEngine` is an async generator: every event comes with a full snapshot, so a UI can
 * animate it, a CLI can print it, and a test can assert on it.
 */
import { updateBeliefs } from "./analyze";
import { HeuristicTheorist } from "./agents/heuristic";
import type { DiscoveryAgent, TheoristProposal } from "./agents/types";
import { designBatch } from "./design";
import { shouldUseLogResponse, toDataset } from "./fit";
import { fmt, fmtR2, formKey } from "./grammar";
import { HypothesisFactory } from "./hypotheses";
import { findOptimum } from "./optimum";
import { createRng, deriveSeed } from "./rng";
import type {
  Anomaly,
  Discovery,
  EngineEvent,
  EngineSnapshot,
  EngineStep,
  ExperimentDesign,
  Hypothesis,
  Lab,
  NotebookEntry,
  Observation,
  Persona,
  Phase,
  VariableImportance,
} from "./types";

export interface EngineConfig {
  lab: Lab;
  seed?: number;
  budget?: number;
  batch?: number;
  agent?: DiscoveryAgent;
  designMode?: "adaptive" | "random";
  /** Stop as soon as a law is established (default true). */
  stopOnDiscovery?: boolean;
  /** Max new hypotheses per cycle. */
  maxNew?: number;
}

export const DISCOVERY_CRITERIA = {
  minPosterior: 0.9,
  minCvR2: 0.95,
  stableCycles: 2,
  minObservations: 16,
};

export async function* runEngine(config: EngineConfig): AsyncGenerator<EngineStep> {
  const lab = config.lab;
  const seed = config.seed ?? 7;
  const budget = Math.min(config.budget ?? lab.defaultBudget, lab.maxExperiments ?? Infinity);
  const batchSize = config.batch ?? lab.defaultBatch;
  const agent = config.agent ?? new HeuristicTheorist();
  const fallback = new HeuristicTheorist();
  const designMode = config.designMode ?? "adaptive";
  const stopOnDiscovery = config.stopOnDiscovery ?? true;
  const maxNew = config.maxNew ?? 6;

  lab.reset?.();
  const runRng = createRng(deriveSeed(seed, "run"));
  const designRng = createRng(deriveSeed(seed, "design"));
  const factory = new HypothesisFactory(lab);

  const hypotheses: Hypothesis[] = [];
  const observations: Observation[] = [];
  const designs: ExperimentDesign[] = [];
  const notebook: NotebookEntry[] = [];
  let importance: VariableImportance[] = [];
  let anomalies: Anomaly[] = [];
  let bestId: string | undefined;
  let confidence = 0;
  let equivalents: string[] = [];
  let discovery: Discovery | undefined;
  let phase: Phase = "idle";
  let cycle = 0;
  let done = false;
  let stopReason: string | undefined;
  let logResponse = false;
  let noteId = 0;
  let streak = { key: "", count: 0 };

  const snapshot = (): EngineSnapshot =>
    structuredClone({
      labId: lab.id,
      seed,
      cycle,
      phase,
      hypotheses,
      observations,
      designs,
      notebook,
      bestId,
      confidence,
      equivalents,
      importance,
      anomalies,
      discovery,
      budget,
      done,
      stopReason,
      agentName: agent.name,
    });

  const step = (event: EngineEvent): EngineStep => ({ event, snapshot: snapshot() });
  const note = (persona: Persona, kind: NotebookEntry["kind"], text: string): EngineStep => {
    const entry: NotebookEntry = { id: ++noteId, cycle, persona, kind, text };
    notebook.push(entry);
    return step({ type: "note", entry });
  };
  const enter = (p: Phase): EngineStep => {
    phase = p;
    return step({ type: "phase", phase: p, cycle });
  };

  yield note(
    "System",
    "think",
    `Objective: ${lab.question} Budget: ${budget} experiments in batches of ${batchSize}. Theorist: ${agent.name}. Design: ${designMode}.`,
  );

  while (!done) {
    cycle += 1;

    // ── PROPOSE ───────────────────────────────────────────────────────────
    yield enter("propose");
    const ctx = {
      lab,
      cycle,
      observations,
      hypotheses,
      bestId,
      confidence,
      equivalents,
      importance,
      anomalies,
      logResponse,
      maxNew,
      seed,
    };
    let proposal: TheoristProposal;
    try {
      proposal = await agent.propose(ctx);
    } catch (err) {
      proposal = await fallback.propose(ctx);
      proposal.fallbackReason = err instanceof Error ? err.message : String(err);
    }
    if (proposal.fallbackReason) {
      yield note("System", "warning", `${agent.name} unavailable (${proposal.fallbackReason}); built-in theorist stepped in.`);
    }
    for (const text of proposal.notebook) yield note(proposal.author, "think", text);
    const keys = new Set(hypotheses.map((h) => h.key));
    for (const seedH of proposal.hypotheses) {
      const prior = seedH.revive ? hypotheses.find((x) => x.status === "refuted" && x.key === formKey(seedH.form)) : undefined;
      if (prior && !prior.verdict?.startsWith("Falsified")) {
        prior.status = "testing";
        prior.bornCycle = cycle;
        prior.diedCycle = undefined;
        prior.verdict = undefined;
        prior.rationale = seedH.rationale;
        yield note("Critic", "think", `Reopening ${prior.id} ${prior.label}: ${seedH.rationale}`);
        yield step({ type: "hypothesis", hypothesis: structuredClone(prior) });
        continue;
      }
      const h = factory.create(seedH, cycle);
      if ("error" in h) {
        yield note("Critic", "warning", `Rejected an ill-formed hypothesis: ${h.error}.`);
        continue;
      }
      if (keys.has(h.key)) continue;
      keys.add(h.key);
      hypotheses.push(h);
      yield step({ type: "hypothesis", hypothesis: structuredClone(h) });
    }

    // ── DESIGN ────────────────────────────────────────────────────────────
    const remaining = budget - observations.length;
    if (remaining <= 0) {
      stopReason = "Experiment budget exhausted.";
      break;
    }
    yield enter("design");
    const design = designBatch({
      lab,
      cycle,
      batch: Math.min(batchSize, remaining),
      observations,
      hypotheses,
      bestId,
      mode: designMode,
      logResponse,
      rng: designRng,
    });
    designs.push(design);
    yield note("Designer", "design", design.rationale);
    yield step({ type: "design", design: structuredClone(design) });

    // ── RUN ───────────────────────────────────────────────────────────────
    yield enter("run");
    let ran = 0;
    for (const point of design.points) {
      const inputs = lab.realize ? lab.realize(point) : point;
      const output = lab.run(inputs, runRng);
      if (!Number.isFinite(output)) continue;
      const obs: Observation = { id: observations.length + 1, cycle, designId: design.id, inputs, output };
      observations.push(obs);
      ran += 1;
      yield step({ type: "observation", observation: obs });
    }
    if (!ran) {
      stopReason = "No more experiments could be run (data pool exhausted).";
      break;
    }
    yield note("Robot", "result", `Ran ${ran} experiment${ran > 1 ? "s" : ""} (${observations.length}/${budget} of budget).`);

    // ── ANALYZE ───────────────────────────────────────────────────────────
    yield enter("analyze");
    const useLog = shouldUseLogResponse(observations.map((o) => o.output));
    if (useLog !== logResponse) {
      logResponse = useLog;
      if (useLog) {
        const ys = observations.map((o) => o.output);
        yield note(
          "Analyst",
          "insight",
          `${lab.output.label} spans ${fmt(Math.log10(Math.max(...ys) / Math.min(...ys)), 2)} orders of magnitude — switching to log-residuals (multiplicative noise model).`,
        );
      }
    }
    const ds = toDataset(
      observations,
      lab.variables.map((v) => v.name),
      logResponse,
    );
    const report = updateBeliefs(hypotheses, ds, lab, cycle, seed);
    bestId = report.bestId;
    confidence = report.confidence;
    equivalents = report.equivalents;
    importance = report.importance;
    anomalies = report.anomalies;
    yield step({ type: "analysis", cycle });

    const best = hypotheses.find((h) => h.id === bestId);
    if (best?.fit) {
      yield note(
        "Analyst",
        "insight",
        `Leader ${best.id} ${best.label} — posterior ${fmt(best.weight * 100, 3)}%${equivalents.length ? ` (${fmt(confidence * 100, 3)}% incl. ${equivalents.length} observationally-equivalent form${equivalents.length > 1 ? "s" : ""})` : ""}, out-of-sample R² ${fmtR2(best.fit.cvR2)}. Fitted law: ${best.fit.equation}.`,
      );
    }
    for (const h of report.refuted) yield note("Critic", "warning", `✗ ${h.id} ${h.label} — ${h.verdict}`);
    for (const h of report.promoted) {
      if (h.id !== bestId) yield note("Analyst", "insight", `${h.id} ${h.label} is now supported by the evidence.`);
    }
    for (const a of anomalies) yield note("Analyst", "warning", a.message);
    if (importance.length && best) {
      const label = (n: string) => lab.variables.find((v) => v.name === n)?.label ?? n;
      const ess = importance.filter((i) => i.verdict === "essential").map((i) => label(i.variable));
      const irr = importance.filter((i) => i.verdict === "irrelevant").map((i) => label(i.variable));
      yield note(
        "Analyst",
        "insight",
        `Ablation: ${ess.length ? `essential → ${ess.join(", ")}` : "no essential variables yet"}${irr.length ? `; no detectable effect → ${irr.join(", ")}` : ""}.`,
      );
    }

    // ── REFLECT ───────────────────────────────────────────────────────────
    yield enter("reflect");
    const c = DISCOVERY_CRITERIA;
    const qualifies =
      !!best?.fit &&
      confidence >= c.minPosterior &&
      best.fit.cvR2 >= c.minCvR2 &&
      anomalies.length === 0 &&
      observations.length >= Math.max(c.minObservations, 3 * best.fit.k) &&
      importance.every((i) => (i.inBest ? i.verdict === "essential" || best.form.terms.length === 1 : i.verdict !== "essential"));
    streak = qualifies && best ? { key: best.key, count: streak.key === best.key ? streak.count + 1 : 1 } : { key: "", count: 0 };

    if (qualifies && best && streak.count >= c.stableCycles && !discovery) {
      best.status = "discovered";
      discovery = {
        hypothesisId: best.id,
        cycle,
        equation: best.fit!.equation,
        statement: best.statement,
        confidence,
        cvR2: best.fit!.cvR2,
        experiments: observations.length,
        equivalents: [...equivalents],
        optimum: findOptimum(best, lab, createRng(deriveSeed(seed, "optimum"))),
      };
      yield note(
        "System",
        "discovery",
        `EUREKA — ${best.fit!.equation}. Held for ${streak.count} consecutive cycles with ${fmt(confidence * 100, 3)}% posterior and out-of-sample R² ${fmtR2(best.fit!.cvR2)}, after ${observations.length} experiments.` +
          (equivalents.length
            ? ` Note: ${equivalents.map((id) => hypotheses.find((x) => x.id === id)?.label).join(", ")} make indistinguishable predictions in the explored range.`
            : ""),
      );
      yield step({ type: "discovery", discovery });
      if (stopOnDiscovery) {
        stopReason = "Law established.";
        break;
      }
    } else if (qualifies && best) {
      yield note("Critic", "think", `${best.id} meets every criterion. Replicating once more before declaring a discovery.`);
    }

    if (observations.length >= budget) {
      stopReason = discovery ? "Law established; budget exhausted." : "Experiment budget exhausted before a law could be established.";
      break;
    }
  }

  done = true;
  phase = "done";
  stopReason ??= "Stopped.";
  yield step({ type: "done", reason: stopReason });
}

/** Run to completion and return the final snapshot (CLI, tests, benchmark). */
export async function runToEnd(config: EngineConfig, onStep?: (s: EngineStep) => void): Promise<EngineSnapshot> {
  let last: EngineStep | undefined;
  for await (const s of runEngine(config)) {
    onStep?.(s);
    last = s;
  }
  return last!.snapshot;
}
