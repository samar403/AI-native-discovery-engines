/**
 * Claude as the Theorist. Runs in the browser (or a worker) and talks to /api/agent,
 * which holds the API key. Claude's conjectures go first; the built-in theorist fills
 * any remaining slots so the loop never stalls on a thin or failed proposal.
 */
import type { HypothesisSeed } from "../hypotheses";
import { HeuristicTheorist } from "./heuristic";
import { buildClaudeContext, type ClaudeProposalResponse } from "./protocol";
import type { DiscoveryAgent, TheoristContext, TheoristProposal } from "./types";

export class ClaudeTheorist implements DiscoveryAgent {
  readonly name = "Claude theorist";
  private readonly local = new HeuristicTheorist();

  constructor(private readonly endpoint = "/api/agent") {}

  async propose(ctx: TheoristContext): Promise<TheoristProposal> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "propose", context: buildClaudeContext(ctx) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const data = (await res.json()) as ClaudeProposalResponse;
    const fromClaude: HypothesisSeed[] = data.hypotheses.map((h) => ({
      form: { combine: h.combine, terms: h.terms },
      origin: "claude",
      statement: h.statement,
      rationale: h.rationale,
      prior: h.prior,
      revive: true,
    }));

    const notebook = [data.notebook];
    const slots = ctx.maxNew - fromClaude.length;
    if (slots > 0 && ctx.observations.length > 0) {
      const local = await this.local.propose(ctx);
      const claudeKeys = new Set(data.hypotheses.map((h) => JSON.stringify(h.terms.map((t) => t.variable + t.shape).sort())));
      const extra = local.hypotheses
        .filter((s) => !claudeKeys.has(JSON.stringify(s.form.terms.map((t) => t.variable + t.shape).sort())))
        .slice(0, slots);
      if (extra.length) notebook.push(`(Built-in theorist added ${extra.length} systematic mutation${extra.length > 1 ? "s" : ""} to complete the slate.)`);
      fromClaude.push(...extra);
    }
    return { author: "Claude", notebook, hypotheses: fromClaude };
  }
}

export async function claudeStatus(endpoint = "/api/agent"): Promise<{ enabled: boolean; model?: string }> {
  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    return res.ok ? await res.json() : { enabled: false };
  } catch {
    return { enabled: false };
  }
}
