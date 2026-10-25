import type { HypothesisSeed } from "../hypotheses";
import type { Anomaly, Hypothesis, Lab, Observation, ShapeId, VariableImportance } from "../types";

export interface MarginalEffect {
  variable: string;
  /** Variance explained by the best single-variable model. */
  r2: number;
  bestSumShape: ShapeId;
  bestProductShape?: ShapeId;
}

export interface TheoristContext {
  lab: Lab;
  cycle: number;
  observations: readonly Observation[];
  hypotheses: readonly Hypothesis[];
  bestId?: string;
  importance: readonly VariableImportance[];
  anomalies: readonly Anomaly[];
  logResponse: boolean;
  maxNew: number;
  seed: number;
}

export interface TheoristProposal {
  /** Lab-notebook reasoning, one paragraph per entry. */
  notebook: string[];
  hypotheses: HypothesisSeed[];
  /** Which persona authored the proposal (for the notebook). */
  author: "Theorist" | "Claude";
  /** Set when an LLM was requested but the engine fell back to its built-in theorist. */
  fallbackReason?: string;
}

export interface DiscoveryAgent {
  readonly name: string;
  propose(ctx: TheoristContext): Promise<TheoristProposal>;
}
