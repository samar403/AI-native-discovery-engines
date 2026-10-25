import type { Hypothesis, HypothesisStatus, Persona, Phase } from "@/engine/types";

export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

export const STATUS: Record<HypothesisStatus, { label: string; icon: string; color: string }> = {
  proposed: { label: "Proposed", icon: "○", color: "var(--st-proposed)" },
  testing: { label: "Testing", icon: "◐", color: "var(--st-testing)" },
  supported: { label: "Supported", icon: "✓", color: "var(--st-supported)" },
  refuted: { label: "Refuted", icon: "✗", color: "var(--st-refuted)" },
  discovered: { label: "Law", icon: "✦", color: "var(--st-discovered)" },
};

export const PERSONA: Record<Persona, { glyph: string; color: string; role: string }> = {
  Theorist: { glyph: "Θ", color: "var(--orchid)", role: "proposes hypotheses" },
  Claude: { glyph: "✺", color: "#e8a07a", role: "LLM theorist" },
  Designer: { glyph: "◇", color: "var(--aqua)", role: "designs experiments" },
  Robot: { glyph: "⚙", color: "var(--ink-3)", role: "runs the lab" },
  Analyst: { glyph: "Σ", color: "var(--phosphor)", role: "fits & compares" },
  Critic: { glyph: "⊘", color: "var(--rose)", role: "falsifies" },
  System: { glyph: "◎", color: "var(--ink-2)", role: "orchestrator" },
};

export const PHASES: { id: Exclude<Phase, "idle" | "done">; label: string; verb: string }[] = [
  { id: "propose", label: "Hypothesize", verb: "Theorist is conjecturing" },
  { id: "design", label: "Design", verb: "Designer is choosing experiments" },
  { id: "run", label: "Experiment", verb: "Robot is running the lab" },
  { id: "analyze", label: "Analyze", verb: "Analyst is fitting & falsifying" },
  { id: "reflect", label: "Reflect", verb: "Critic is checking the criteria" },
];

export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

/** Stable pseudo-random angle per hypothesis id (golden-angle spiral). */
export function orbitAngle(id: string): number {
  const n = Number(id.replace(/\D/g, "")) || 1;
  return (n * 137.508 * Math.PI) / 180;
}

export function rankAlive(hs: readonly Hypothesis[]): Hypothesis[] {
  return hs.filter((h) => h.status !== "refuted" && h.fit?.ok).sort((a, b) => b.weight - a.weight);
}
