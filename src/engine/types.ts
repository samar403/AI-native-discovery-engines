/**
 * Core vocabulary of the discovery engine.
 *
 * A *Lab* is a world with hidden laws. The engine never sees the law; it can only
 * propose *Hypotheses* (symbolic model forms), design *Experiments* (settings of the
 * controllable variables), observe noisy *Observations*, and update its beliefs.
 */

export type ShapeId = "linear" | "quadratic" | "log" | "power" | "exp" | "saturating" | "peak";

export interface Term {
  variable: string;
  shape: ShapeId;
}

/** `sum`: y = b0 + Σ g(x)   ·   `product`: y = A · Π h(x) */
export interface HypothesisForm {
  combine: "sum" | "product";
  terms: Term[];
}

export type HypothesisStatus = "proposed" | "testing" | "supported" | "refuted" | "discovered";

export type HypothesisOrigin = "screening" | "theorist" | "mutation" | "residual" | "claude" | "user";

export interface FitResult {
  ok: boolean;
  params: number[];
  paramNames: string[];
  stderr: number[];
  sse: number;
  rmse: number;
  r2: number;
  /** k-fold cross-validated R² — out-of-sample predictive power. */
  cvR2: number;
  bic: number;
  k: number;
  n: number;
  equation: string;
}

export interface BeliefPoint {
  cycle: number;
  weight: number;
  cvR2: number;
}

export interface Hypothesis {
  id: string;
  /** Canonical key for de-duplication. */
  key: string;
  label: string;
  form: HypothesisForm;
  statement: string;
  rationale: string;
  origin: HypothesisOrigin;
  bornCycle: number;
  parentId?: string;
  prior: number;
  status: HypothesisStatus;
  /** Posterior model probability among live hypotheses (BIC approximation). */
  weight: number;
  fit?: FitResult;
  history: BeliefPoint[];
  diedCycle?: number;
  verdict?: string;
}

export interface Variable {
  name: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  scale?: "linear" | "log";
}

export interface OutputSpec {
  name: string;
  label: string;
  unit: string;
}

export type Inputs = Record<string, number>;

export interface Observation {
  id: number;
  cycle: number;
  designId: string;
  inputs: Inputs;
  output: number;
}

export type DesignStrategy = "screening" | "discriminate" | "optimize" | "random";

export interface ExperimentDesign {
  id: string;
  cycle: number;
  strategy: DesignStrategy;
  points: Inputs[];
  rationale: string;
  /** Hypotheses this batch is meant to separate. */
  targets: string[];
}

export interface GroundTruth {
  equation: string;
  summary: string;
  form: HypothesisForm;
  /** Reference parameter values keyed as `${variable}.${param}` (e.g. "L.p": 0.5). */
  reference?: Record<string, number>;
  /** Real but minor effects: including them is not counted as spurious. */
  optional?: string[];
}

export interface Lab {
  id: string;
  name: string;
  field: string;
  tagline: string;
  description: string;
  question: string;
  variables: Variable[];
  output: OutputSpec;
  objective?: "maximize" | "minimize";
  defaultBudget: number;
  defaultBatch: number;
  noiseNote: string;
  hue: string;
  glyph: string;
  /** Run one experiment. Pure function of inputs + rng (except dataset labs, which draw from a pool). */
  run(inputs: Inputs, rng: import("./rng").Rng): number;
  /** Optional: snap a designed point to what is actually runnable (dataset labs pick the nearest row). */
  realize?(inputs: Inputs): Inputs;
  truth?: GroundTruth;
  /** Hard cap on experiments (dataset labs have a finite pool). */
  maxExperiments?: number;
  reset?(): void;
}

export interface VariableImportance {
  variable: string;
  /** Drop in cross-validated R² when this variable is removed from the best model. */
  deltaCvR2: number;
  /** BIC penalty paid for removing it (positive ⇒ variable is needed). */
  deltaBic: number;
  inBest: boolean;
  verdict: "essential" | "minor" | "irrelevant";
}

export interface Anomaly {
  variable: string;
  shape: ShapeId;
  r: number;
  p: number;
  message: string;
}

export interface Discovery {
  hypothesisId: string;
  cycle: number;
  equation: string;
  statement: string;
  confidence: number;
  cvR2: number;
  experiments: number;
  /** Rival forms the data cannot distinguish from the law (same variables, same predictions). */
  equivalents: string[];
  optimum?: { inputs: Inputs; value: number };
}

export type Persona = "Theorist" | "Designer" | "Robot" | "Analyst" | "Critic" | "Claude" | "System";

export interface NotebookEntry {
  id: number;
  cycle: number;
  persona: Persona;
  kind: "think" | "design" | "result" | "insight" | "warning" | "discovery";
  text: string;
}

export type Phase = "idle" | "propose" | "design" | "run" | "analyze" | "reflect" | "done";

export interface EngineSnapshot {
  labId: string;
  seed: number;
  cycle: number;
  phase: Phase;
  hypotheses: Hypothesis[];
  observations: Observation[];
  designs: ExperimentDesign[];
  notebook: NotebookEntry[];
  bestId?: string;
  /** Posterior mass of the leader's observational-equivalence class. */
  confidence: number;
  equivalents: string[];
  importance: VariableImportance[];
  anomalies: Anomaly[];
  discovery?: Discovery;
  budget: number;
  done: boolean;
  stopReason?: string;
  agentName: string;
}

export type EngineEvent =
  | { type: "phase"; phase: Phase; cycle: number }
  | { type: "hypothesis"; hypothesis: Hypothesis }
  | { type: "design"; design: ExperimentDesign }
  | { type: "observation"; observation: Observation }
  | { type: "analysis"; cycle: number }
  | { type: "note"; entry: NotebookEntry }
  | { type: "discovery"; discovery: Discovery }
  | { type: "done"; reason: string };

export interface EngineStep {
  event: EngineEvent;
  snapshot: EngineSnapshot;
}
