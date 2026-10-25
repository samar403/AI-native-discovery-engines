/** Build a lab + agent from a serialisable run config (shared by the worker and the inline runner). */
import { ClaudeTheorist } from "./agents/claude";
import { HeuristicTheorist } from "./agents/heuristic";
import { runEngine } from "./engine";
import { getLab } from "./labs";
import { createDatasetLab, parseCsv } from "./labs/dataset";
import type { EngineStep, Lab } from "./types";
export interface DatasetConfig {
  name: string;
  csv: string;
  inputs: string[];
  output: string;
}

export interface RunConfig {
  labId: string;
  seed: number;
  budget?: number;
  batch?: number;
  theorist: "builtin" | "claude";
  designMode: "adaptive" | "random";
  dataset?: DatasetConfig;
}

export function buildLab(cfg: Pick<RunConfig, "labId" | "dataset">): Lab {
  if (cfg.labId === "dataset") {
    if (!cfg.dataset) throw new Error("No dataset supplied.");
    return createDatasetLab(parseCsv(cfg.dataset.csv), cfg.dataset.inputs, cfg.dataset.output, cfg.dataset.name);
  }
  const lab = getLab(cfg.labId);
  if (!lab) throw new Error(`Unknown lab "${cfg.labId}".`);
  return lab;
}

export async function* runConfigured(cfg: RunConfig): AsyncGenerator<EngineStep> {
  yield* runEngine({
    lab: buildLab(cfg),
    seed: cfg.seed,
    budget: cfg.budget,
    batch: cfg.batch,
    designMode: cfg.designMode,
    agent: cfg.theorist === "claude" ? new ClaudeTheorist() : new HeuristicTheorist(),
  });
}

