import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { ClaudeContext, ClaudeReportRequest } from "@/engine/agents/protocol";
import { claudeConfigured, ClaudeUnavailable, interpret, MODEL, propose } from "@/server/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BODY = 400_000;

export async function GET() {
  return NextResponse.json({ enabled: claudeConfigured(), model: claudeConfigured() ? MODEL : undefined });
}

export async function POST(req: Request) {
  if (!claudeConfigured()) {
    return NextResponse.json({ error: "Claude is not configured (set ANTHROPIC_API_KEY)." }, { status: 503 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Request too large." }, { status: 413 });

  let body: { task?: string; context?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    if (body.task === "propose") {
      return NextResponse.json(await propose(body.context as ClaudeContext));
    }
    if (body.task === "report") {
      return NextResponse.json({ markdown: await interpret(body.context as ClaudeReportRequest) });
    }
    return NextResponse.json({ error: `Unknown task "${body.task}".` }, { status: 400 });
  } catch (err) {
    if (err instanceof ClaudeUnavailable) return NextResponse.json({ error: err.message }, { status: 502 });
    if (err instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "Invalid Anthropic API key." }, { status: 401 });
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Rate limited by the Claude API — retry shortly." }, { status: 429 });
    if (err instanceof Anthropic.BadRequestError) return NextResponse.json({ error: `Claude API rejected the request: ${err.message}` }, { status: 400 });
    if (err instanceof Anthropic.APIConnectionError) return NextResponse.json({ error: "Could not reach the Claude API." }, { status: 504 });
    if (err instanceof Anthropic.APIError) return NextResponse.json({ error: `Claude API error ${err.status ?? ""}: ${err.message}` }, { status: 502 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
