/**
 * Server-only Claude calls. The API key never leaves the server.
 *
 *  - propose(): structured output (Zod schema) → falsifiable hypotheses in the engine's grammar
 *  - interpret(): a short scientific interpretation for the final report
 *
 * Both opt into server-side refusal fallbacks (`fallbacks: "default"`).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ClaudeContext, ClaudeProposalResponse, ClaudeReportRequest } from "@/engine/agents/protocol";
import { ALL_SHAPES } from "@/engine/grammar";

export const MODEL = process.env.EUREKA_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.EUREKA_EFFORT as "low" | "medium" | "high" | "xhigh" | "max" | undefined) || "medium";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.EUREKA_ENABLE_CLAUDE === "1");
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ timeout: 120_000, maxRetries: 2 }));

const ShapeEnum = z.enum(ALL_SHAPES as [string, ...string[]]);

const ProposalSchema = z.object({
  notebook_entry: z
    .string()
    .describe("2–4 sentences for the lab notebook: what the evidence says and why these conjectures are worth testing."),
  hypotheses: z.array(
    z.object({
      statement: z.string().describe("One-sentence natural-language claim, specific and falsifiable."),
      rationale: z.string().describe("Why this is plausible given the evidence or domain knowledge (1–2 sentences)."),
      combine: z.enum(["sum", "product"]),
      terms: z.array(z.object({ variable: z.string(), shape: ShapeEnum })),
      prior: z.number().describe("Prior plausibility in (0, 1]; 1 = as likely as anything else on the board."),
    }),
  ),
});

const SYSTEM = `You are the Theorist inside Eureka, an autonomous scientific discovery engine that runs a closed loop:
propose hypotheses → design experiments → run them → analyse results → repeat.

Your job each cycle is to propose NEW, falsifiable hypotheses about how the controllable variables determine the measured output.
The engine will fit every hypothesis by nonlinear least squares, score it by cross-validated R² and BIC, convert BIC into posterior
probabilities, design experiments where rival hypotheses disagree most, and falsify the losers. So proposals must be precise enough
to be fitted — they are expressed in this grammar:

  combine = "sum":     y = b0 + Σ g_k(x_k)       g ∈ {linear, quadratic, log, power, exp, saturating, peak}
  combine = "product": y = A · Π h_k(x_k)        h ∈ {linear, power, exp, saturating, peak}

  linear: b·x (product: proportional to x)   quadratic: b1·x + b2·x²   log: b·ln x
  power: b·x^p   exp: b·e^(k·x)   saturating (Hill / Michaelis–Menten): b·x^n/(K^n + x^n)
  peak (an optimum): b·exp(−½((x−μ)/s)²)
  Each variable appears at most once; at most the stated maximum number of terms; free parameters are fitted, never specified.
  log and power require the variable to be strictly positive over its range.

How to be a good theorist here:
- Use the evidence: leaderboard, refuted hypotheses and their verdicts, ablation (ΔBIC when a variable is removed from / added to the
  leader), residual anomalies and the marginal scan. Anomalies usually mean the leader is missing a term or has the wrong shape.
- Use domain knowledge (physics, chemistry, biology, economics) to suggest the functional forms real laws take — e.g. scaling laws,
  saturation kinetics, Arrhenius dependence, optima — but only when the data does not contradict them.
- Prefer parsimony. Do not include variables the ablation marks irrelevant unless you have a specific reason.
- Propose genuinely different rivals that the next experiment could discriminate between, not cosmetic variants.
- Never repeat a form whose key is listed in existingKeys unless it was pruned and new evidence supports reopening it.
- Before any data exists, propose a small set of broad, plausible first conjectures.
- Use only the variable names given. Propose at most maxNew hypotheses.`;

export async function propose(ctx: ClaudeContext): Promise<ClaudeProposalResponse> {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT, format: betaZodOutputFormat(ProposalSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Cycle ${ctx.cycle}. Current state of the investigation (JSON):\n\n${JSON.stringify(ctx)}\n\nPropose up to ${ctx.maxNew} new hypotheses.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new ClaudeUnavailable("Claude declined this request.");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new ClaudeUnavailable(`No structured output (stop reason: ${response.stop_reason}).`);

  const names = new Set(ctx.lab.variables.map((v) => v.name));
  return {
    notebook: parsed.notebook_entry,
    hypotheses: parsed.hypotheses
      .filter((h) => h.terms.every((t) => names.has(t.variable)))
      .slice(0, ctx.maxNew)
      .map((h) => ({
        statement: h.statement,
        rationale: h.rationale,
        combine: h.combine,
        terms: h.terms.map((t) => ({ variable: t.variable, shape: t.shape as ClaudeProposalResponse["hypotheses"][number]["terms"][number]["shape"] })),
        prior: Math.min(Math.max(h.prior, 0.05), 1),
      })),
    model: response.model,
  };
}

export async function interpret(req: ClaudeReportRequest): Promise<string> {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT },
    system:
      "You are the senior scientist reviewing an autonomous discovery run. Write a concise interpretation (3–5 short paragraphs, Markdown, no headings): what was found, how strong the evidence is, what the law means in domain terms, caveats (range of validity, confounds, equivalent forms), and the two most valuable next experiments. Be precise and sober; do not invent numbers not present in the summary.",
    messages: [
      {
        role: "user",
        content: `Lab: ${req.labName}\nQuestion: ${req.question}\n\nRun summary:\n\n${req.summaryMarkdown}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new ClaudeUnavailable("Claude declined this request.");
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export class ClaudeUnavailable extends Error {}
