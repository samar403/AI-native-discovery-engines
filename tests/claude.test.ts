import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeTheorist } from "../src/engine/agents/claude";
import { buildClaudeContext, type ClaudeProposalResponse } from "../src/engine/agents/protocol";
import { runToEnd } from "../src/engine/engine";
import { kepler } from "../src/engine/labs";

const proposal: ClaudeProposalResponse = {
  notebook: "Kepler-style scaling: period should follow a power of the orbit and of the stellar mass.",
  hypotheses: [
    {
      statement: "P ∝ a^p · M^q",
      rationale: "Newtonian gravity implies a scaling law.",
      combine: "product",
      terms: [
        { variable: "a", shape: "power" },
        { variable: "M", shape: "power" },
      ],
      prior: 0.9,
    },
    { statement: "bogus", rationale: "invalid on purpose", combine: "product", terms: [{ variable: "a", shape: "quadratic" }], prior: 1 },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("Claude theorist (mocked API route)", () => {
  it("sends a compact context and merges Claude's conjectures into the loop", async () => {
    const bodies: { task: string; context: ReturnType<typeof buildClaudeContext> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify(proposal), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const snap = await runToEnd({ lab: kepler, seed: 4, agent: new ClaudeTheorist("http://test/api/agent"), budget: 48 });
    expect(bodies[0].task).toBe("propose");
    expect(bodies[0].context.lab.variables.map((v) => v.name)).toEqual(["a", "M", "mp"]);
    expect(bodies[1].context.data.length).toBeGreaterThan(0);
    const fromClaude = snap.hypotheses.filter((h) => h.origin === "claude");
    expect(fromClaude.map((h) => h.label)).toContain("aᵖ · Mᵖ");
    // the ill-formed proposal is rejected by the Critic, not crashed on
    expect(snap.notebook.some((n) => n.persona === "Critic" && n.text.includes("ill-formed"))).toBe(true);
    expect(snap.notebook.some((n) => n.persona === "Claude")).toBe(true);
    expect(snap.discovery?.equation).toMatch(/a\^1\.5/);
  });

  it("falls back to the built-in theorist when the route errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Claude is not configured" }), { status: 503 })));
    const snap = await runToEnd({ lab: kepler, seed: 4, agent: new ClaudeTheorist("http://test/api/agent"), budget: 24 });
    expect(snap.notebook.some((n) => n.text.includes("Claude is not configured"))).toBe(true);
    expect(snap.hypotheses.length).toBeGreaterThan(3);
  });
});
