"use client";

import { useMemo, useState } from "react";
import { fmtR2 } from "@/engine/grammar";
import type { EngineSnapshot, Hypothesis, Phase } from "@/engine/types";
import { orbitAngle, PHASES, STATUS, pct } from "@/lib/ui";

/**
 * The Loop Reactor.
 *
 * Outer ring: the five phases of the loop, with a comet marking the active one.
 * Inside: a "gravity well" of hypotheses. Distance from the centre encodes posterior
 * probability (evidence pulls good theories inward); falsified ones are flung out to
 * the graveyard ring.
 */
const C = 300;
const RING = 272;
const WELL = 200;
const GRAVE = 232;

const radiusFor = (w: number) => (w >= 0.985 ? 0 : Math.max(18, WELL * (1 - Math.pow(Math.max(w, 0), 0.3))));

function arcPath(r: number, a0: number, a1: number, reverse = false) {
  const p = (a: number) => [C + r * Math.cos(a), C + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  // reversed arcs run counter-clockwise so text along the bottom reads upright
  return reverse ? `M ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x0} ${y0}` : `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

interface Placed {
  h: Hypothesis;
  x: number;
  y: number;
  r: number;
  kind: "alive" | "proposed" | "refuted" | "law";
}

export function Reactor({
  snapshot,
  selectedId,
  onSelect,
  compact = false,
  computing = false,
}: {
  snapshot: EngineSnapshot | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  compact?: boolean;
  computing?: boolean;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const phase: Phase = snapshot?.phase ?? "idle";
  const cycle = snapshot?.cycle ?? 0;
  const phaseIdx = PHASES.findIndex((p) => p.id === phase);
  const cometDeg = (Math.max(cycle - 1, 0) * 5 + Math.max(phaseIdx, 0)) * 72 + 36;

  const placed: Placed[] = useMemo(() => {
    if (!snapshot) return [];
    const lawId = snapshot.discovery?.hypothesisId;
    return snapshot.hypotheses.map((h) => {
      const a = orbitAngle(h.id);
      let r: number;
      let size: number;
      let kind: Placed["kind"];
      if (h.id === lawId) {
        r = 0;
        size = 22;
        kind = "law";
      } else if (h.status === "refuted") {
        r = GRAVE + ((Number(h.id.slice(1)) * 7) % 11) - 5;
        size = 3.5;
        kind = "refuted";
      } else if (!h.fit?.ok) {
        r = WELL + 6;
        size = 6;
        kind = "proposed";
      } else {
        r = radiusFor(h.weight);
        size = 5 + 15 * Math.sqrt(h.weight);
        kind = "alive";
      }
      return { h, x: C + r * Math.cos(a), y: C + r * Math.sin(a), r: size, kind };
    });
  }, [snapshot]);

  const labelled = new Set(
    placed
      .filter((p) => p.kind === "alive" || p.kind === "law")
      .sort((a, b) => b.h.weight - a.h.weight)
      .slice(0, compact ? 2 : 3)
      .map((p) => p.h.id),
  );
  const tip = placed.find((p) => p.h.id === (hover ?? null));
  const discovered = !!snapshot?.discovery;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[640px] select-none">
      <svg viewBox="0 0 600 600" className="h-full w-full overflow-visible" role="img" aria-label="Discovery loop and hypothesis gravity well">
        <defs>
          <radialGradient id="well" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,181,71,0.18)" />
            <stop offset="45%" stopColor="rgba(79,227,193,0.05)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="comet-tail" x1="0" x2="1">
            <stop offset="0" stopColor="rgba(255,181,71,0)" />
            <stop offset="1" stopColor="rgba(255,181,71,0.9)" />
          </linearGradient>
        </defs>

        <circle cx={C} cy={C} r={WELL + 20} fill="url(#well)" />

        {/* posterior contour rings */}
        {[0.5, 0.1, 0.01].map((w) => (
          <g key={w}>
            <circle cx={C} cy={C} r={radiusFor(w)} fill="none" stroke="var(--line)" strokeDasharray="2 5" />
            {!compact && (
              <text x={C + 4} y={C - radiusFor(w) - 4} fill="var(--ink-4)" fontSize="10" fontFamily="var(--font-geist-mono)">
                p={w}
              </text>
            )}
          </g>
        ))}
        <circle cx={C} cy={C} r={WELL + 6} fill="none" stroke="var(--line-strong)" strokeDasharray="1 3" />
        <circle cx={C} cy={C} r={GRAVE} fill="none" stroke="rgba(255,107,129,0.07)" strokeWidth="12" />
        <circle cx={C} cy={C} r={GRAVE + 6} fill="none" stroke="rgba(255,107,129,0.16)" strokeDasharray="1 4" />
        {!compact && (
          <text fill="rgba(255,107,129,0.6)" fontSize="9" fontFamily="var(--font-geist-mono)" letterSpacing="3">
            <textPath href="#grave-path" startOffset="50%" textAnchor="middle">
              FALSIFIED
            </textPath>
          </text>
        )}
        <path id="grave-path" d={arcPath(GRAVE + 2, Math.PI * 0.38, Math.PI * 0.62, true)} fill="none" />

        {/* phase arcs */}
        {PHASES.map((p, i) => {
          const a0 = ((i * 72 - 90 + 2.5) * Math.PI) / 180;
          const a1 = (((i + 1) * 72 - 90 - 2.5) * Math.PI) / 180;
          const active = p.id === phase;
          return (
            <g key={p.id}>
              <path
                d={arcPath(RING, a0, a1)}
                fill="none"
                stroke={active ? "var(--phosphor)" : "var(--line-strong)"}
                strokeWidth={active ? 3 : 1.5}
                strokeLinecap="round"
                filter={active ? "url(#glow)" : undefined}
                style={{ transition: "stroke 0.4s" }}
              />
              <path
                id={`arc-label-${p.id}`}
                d={Math.sin((a0 + a1) / 2) > 0.25 ? arcPath(RING - 7, a0, a1, true) : arcPath(RING - 16, a0, a1)}
                fill="none"
              />
              <text
                fill={active ? "var(--phosphor)" : "var(--ink-3)"}
                fontSize={compact ? 13 : 11}
                fontFamily="var(--font-geist-mono)"
                letterSpacing="2.5"
                style={{ transition: "fill 0.4s" }}
              >
                <textPath href={`#arc-label-${p.id}`} startOffset="50%" textAnchor="middle">
                  {`${String(i + 1).padStart(2, "0")} ${p.label.toUpperCase()}`}
                </textPath>
              </text>
            </g>
          );
        })}

        {/* comet */}
        {phaseIdx >= 0 && (
          <g
            style={{
              transform: `rotate(${cometDeg}deg)`,
              transformOrigin: "300px 300px",
              transition: "transform 0.9s cubic-bezier(.6,0,.2,1)",
            }}
          >
            <path d={arcPath(RING, -Math.PI / 2 - 0.5, -Math.PI / 2)} stroke="url(#comet-tail)" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx={C} cy={C - RING} r="6" fill="var(--phosphor)" filter="url(#glow)" />
          </g>
        )}

        {/* discovery halo */}
        {discovered && (
          <g>
            <g className="spin-slow">
              {Array.from({ length: 24 }, (_, i) => {
                const a = (i / 24) * Math.PI * 2;
                return (
                  <line
                    key={i}
                    x1={C + 34 * Math.cos(a)}
                    y1={C + 34 * Math.sin(a)}
                    x2={C + (i % 2 ? 64 : 90) * Math.cos(a)}
                    y2={C + (i % 2 ? 64 : 90) * Math.sin(a)}
                    stroke="rgba(255,243,196,0.35)"
                    strokeWidth="1"
                  />
                );
              })}
            </g>
            <circle cx={C} cy={C} r="40" fill="rgba(255,181,71,0.12)" />
          </g>
        )}

        {/* hypotheses */}
        {placed.map((p) => {
          const st = STATUS[p.kind === "law" ? "discovered" : p.h.status];
          const isSel = selectedId === p.h.id;
          return (
            <g
              key={p.h.id}
              style={{
                transform: `translate(${p.x}px, ${p.y}px)`,
                transition: "transform 1.1s cubic-bezier(.2,.7,.2,1)",
                cursor: onSelect ? "pointer" : "default",
              }}
              onMouseEnter={() => setHover(p.h.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(isSel ? null : p.h.id)}
            >
              {/* generous hit target */}
              <circle r={Math.max(p.r + 8, 14)} fill="transparent" />
              {p.kind === "proposed" ? (
                <circle r={p.r} fill="none" stroke={st.color} strokeDasharray="2 2" strokeWidth="1.5" className="breathe" />
              ) : (
                <>
                  {(p.kind === "alive" || p.kind === "law") && <circle r={p.r + 6} fill={st.color} opacity={0.12} />}
                  <circle
                    r={p.r}
                    fill={p.kind === "refuted" ? "rgba(255,107,129,0.45)" : st.color}
                    stroke={isSel ? "var(--ink)" : "var(--surface)"}
                    strokeWidth={isSel ? 2.5 : 2}
                    filter={p.kind === "law" ? "url(#glow)" : undefined}
                    style={{ transition: "r 0.9s, fill 0.5s" }}
                  />
                </>
              )}
              {labelled.has(p.h.id) && (
                <text
                  x={p.r + 8}
                  y={4}
                  fill={p.kind === "law" ? "var(--st-discovered)" : "var(--ink-2)"}
                  fontSize={compact ? 15 : 12}
                  fontFamily="var(--font-geist-mono)"
                  style={{ paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 4 }}
                >
                  {p.h.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* centre readout */}
      {!discovered && snapshot && !compact && (
        <div className="pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2 text-center">
          {computing && phase === "propose" && <div className="eyebrow breathe">thinking…</div>}
        </div>
      )}

      {tip && (
        <div
          className="pointer-events-none absolute z-20 w-64 -translate-x-1/2 rounded-xl border border-line-strong bg-surface/95 p-3 text-xs shadow-2xl backdrop-blur"
          style={{ left: `${(tip.x / 600) * 100}%`, top: `calc(${(tip.y / 600) * 100}% + 18px)` }}
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-ink-3">{tip.h.id}</span>
            <span style={{ color: STATUS[tip.h.status].color }}>
              {STATUS[tip.h.status].icon} {STATUS[tip.h.status].label}
            </span>
          </div>
          <div className="mb-1 font-mono text-[13px] text-ink">{tip.h.label}</div>
          <p className="mb-2 leading-snug text-ink-2">{tip.h.statement}</p>
          {tip.h.fit?.ok && (
            <div className="grid grid-cols-2 gap-1 font-mono text-[11px] text-ink-3">
              <span>posterior {pct(tip.h.weight)}</span>
              <span>CV R² {fmtR2(tip.h.fit.cvR2)}</span>
            </div>
          )}
          {tip.h.verdict && <p className="mt-2 text-[11px] leading-snug text-rose">{tip.h.verdict}</p>}
        </div>
      )}
    </div>
  );
}
