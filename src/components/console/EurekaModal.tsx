"use client";

import { useEffect, useState } from "react";
import { fmt, fmtR2 } from "@/engine/grammar";
import { buildMarkdownReport, finalHypothesis, scoreAgainstTruth } from "@/engine/report";
import type { EngineSnapshot, Lab } from "@/engine/types";
import { download } from "@/lib/download";
import { pct } from "@/lib/ui";

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`Truth match ${score} of 100`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke={score >= 90 ? "var(--aqua)" : score >= 70 ? "var(--phosphor)" : "var(--rose)"}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dasharray 1.2s" }}
      />
      <text x="44" y="50" textAnchor="middle" fontSize="20" fill="var(--ink)" fontFamily="var(--font-geist-mono)">
        {score}
      </text>
    </svg>
  );
}

export function EurekaModal({
  snapshot,
  lab,
  open,
  onClose,
  claudeEnabled,
}: {
  snapshot: EngineSnapshot;
  lab: Lab;
  open: boolean;
  onClose: () => void;
  claudeEnabled: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    setReveal(false);
    setNarrative(null);
    setErr(null);
  }, [snapshot.seed, snapshot.labId]);

  if (!open) return null;
  const h = finalHypothesis(snapshot);
  const d = snapshot.discovery;
  const score = scoreAgainstTruth(snapshot, lab);
  const falsified = snapshot.hypotheses.filter((x) => x.status === "refuted").length;
  const label = (n: string) => lab.variables.find((v) => v.name === n)?.label ?? n;
  const slug = `${lab.id}-seed${snapshot.seed}`;

  const askClaude = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: "report",
          context: { labName: lab.name, question: lab.question, summaryMarkdown: buildMarkdownReport(snapshot, { ...lab, truth: undefined }) },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setNarrative(body.markdown);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Discovery summary">
      <div className="panel rise scroll-thin max-h-[92vh] w-full max-w-3xl overflow-y-auto p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-4">
          <div>
            <div className="eyebrow">{d ? `cycle ${d.cycle} · ${d.experiments} experiments` : snapshot.stopReason}</div>
            <h2 className={`font-display mt-1 text-6xl italic sm:text-7xl ${d ? "glow-text text-[var(--st-discovered)]" : "text-ink-2"}`}>
              {d ? "Eureka." : "Inconclusive."}
            </h2>
          </div>
          <button onClick={onClose} className="ml-auto rounded-full border border-line px-3 py-1 text-sm text-ink-3 hover:text-ink" aria-label="Close">
            Esc
          </button>
        </div>

        {h?.fit?.ok && (
          <div className="mt-6 rounded-2xl border border-phosphor/30 bg-black/40 p-5">
            <div className="eyebrow mb-2">{d ? "law established" : "best surviving hypothesis"}</div>
            <div className="break-words font-mono text-lg leading-relaxed text-ink sm:text-xl">{h.fit.equation}</div>
            <p className="mt-3 text-sm text-ink-2">{h.statement}</p>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Posterior", pct(d?.confidence ?? snapshot.confidence ?? h?.weight ?? 0)],
            ["Out-of-sample R²", h?.fit?.ok ? fmtR2(h.fit.cvR2) : "—"],
            ["Experiments", `${snapshot.observations.length}/${snapshot.budget}`],
            ["Falsified", `${falsified} of ${snapshot.hypotheses.length}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-surface-2 p-3">
              <div className="eyebrow !text-[10px]">{k}</div>
              <div className="mt-1 font-mono text-lg">{v}</div>
            </div>
          ))}
        </div>

        {d?.optimum && (
          <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4 text-sm">
            <span className="eyebrow mr-2">predicted {lab.objective === "maximize" ? "optimum" : "minimum"}</span>
            <span className="font-mono text-ink">
              {Object.entries(d.optimum.inputs)
                .map(([k, v]) => `${label(k)} ${fmt(v)}`)
                .join(" · ")}{" "}
              → {lab.output.label} ≈ {fmt(d.optimum.value)} {lab.output.unit}
            </span>
          </div>
        )}

        {d && d.equivalents.length > 0 && (
          <p className="mt-3 text-xs text-ink-3">
            Indistinguishable within the explored range:{" "}
            {d.equivalents.map((id) => snapshot.hypotheses.find((x) => x.id === id)?.label).join(", ")}. Extend the range to separate them.
          </p>
        )}

        {lab.truth && (
          <div className="mt-6">
            {!reveal ? (
              <button
                onClick={() => setReveal(true)}
                className="w-full rounded-xl border border-dashed border-line-strong py-3 text-sm text-ink-2 transition hover:border-phosphor hover:text-phosphor"
              >
                Reveal the hidden ground truth →
              </button>
            ) : (
              <div className="rise grid gap-4 rounded-2xl border border-line bg-surface-2 p-5 sm:grid-cols-[1fr_auto]">
                <div>
                  <div className="eyebrow mb-1">ground truth</div>
                  <div className="font-mono text-[15px] text-aqua">{lab.truth.equation}</div>
                  <p className="mt-2 text-sm text-ink-2">{lab.truth.summary}</p>
                  {score && (
                    <ul className="mt-3 space-y-1 text-xs text-ink-3">
                      {score.shapes.map((s) => (
                        <li key={s.variable}>
                          <span className={s.ok ? "text-aqua" : "text-rose"}>{s.ok ? "✓" : "✗"}</span> {label(s.variable)}: truth {s.truth}, found {s.found ?? "—"}
                        </li>
                      ))}
                      {score.params.map((p) => (
                        <li key={p.name} className="font-mono">
                          {p.name}: {fmt(p.estimate)} vs {fmt(p.truth)} ({fmt(p.relErr * 100, 2)}% off)
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {score && (
                  <div className="flex flex-col items-center justify-center">
                    <ScoreRing score={score.score} />
                    <span className="eyebrow mt-1">truth match</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {narrative && (
          <div className="rise mt-6 rounded-2xl border border-line bg-surface-2 p-5">
            <div className="eyebrow mb-2">Claude&apos;s interpretation</div>
            {narrative.split(/\n{2,}/).map((p, i) => (
              <p key={i} className="mb-3 text-sm leading-relaxed text-ink-2 last:mb-0">
                {p.replace(/\*\*/g, "")}
              </p>
            ))}
          </div>
        )}
        {err && <p className="mt-3 text-sm text-rose">Claude: {err}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={() => download(`eureka-${slug}.md`, buildMarkdownReport(snapshot, lab, narrative ?? undefined), "text/markdown")}
            className="rounded-full bg-phosphor px-4 py-2 text-sm font-medium text-black hover:brightness-110"
          >
            Download report (.md)
          </button>
          <button
            onClick={() => download(`eureka-${slug}.json`, JSON.stringify(snapshot, null, 2), "application/json")}
            className="rounded-full border border-line-strong px-4 py-2 text-sm text-ink-2 hover:text-ink"
          >
            Export run (.json)
          </button>
          <button
            onClick={askClaude}
            disabled={!claudeEnabled || loading}
            title={claudeEnabled ? "Ask Claude to interpret the result" : "Set ANTHROPIC_API_KEY on the server to enable"}
            className="rounded-full border border-line-strong px-4 py-2 text-sm text-ink-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? <span className="breathe">Claude is reading the notebook…</span> : "✺ Claude interpretation"}
          </button>
          <button onClick={onClose} className="ml-auto rounded-full px-4 py-2 text-sm text-ink-3 hover:text-ink">
            Keep exploring
          </button>
        </div>
      </div>
    </div>
  );
}
