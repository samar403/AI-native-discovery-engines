"use client";

import { useMemo, useState } from "react";
import { shouldUseLogResponse } from "@/engine/fit";
import { compile, fmt } from "@/engine/grammar";
import type { EngineSnapshot, Hypothesis, Lab } from "@/engine/types";
import { useSize } from "@/hooks/useSize";
import { linearScale, logScale, type Scale } from "@/lib/scale";
import { rankAlive, SERIES } from "@/lib/ui";
import { quantile } from "@/engine/stats";

type Mode = "slice" | "parity";

const H = 300;
const M = { l: 52, r: 96, t: 14, b: 36 };

/**
 * Evidence field: observations as a partial-residual plot along one variable, with the
 * rival hypotheses' predictions overlaid. As the right law is found, the cloud collapses
 * onto its curve. Parity mode plots predicted vs observed for any number of variables.
 */
export function EvidenceField({
  snapshot,
  lab,
  selectedId,
}: {
  snapshot: EngineSnapshot | null;
  lab: Lab;
  selectedId?: string | null;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [mode, setMode] = useState<Mode>("slice");
  const [xVarChoice, setXVar] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const obs = useMemo(() => snapshot?.observations ?? [], [snapshot]);
  const names = lab.variables.map((v) => v.name);
  const autoVar =
    snapshot?.importance
      .filter((i) => i.inBest)
      .sort((a, b) => b.deltaBic - a.deltaBic)[0]?.variable ?? names[0];
  const xVar = xVarChoice ?? autoVar;
  const v = lab.variables.find((x) => x.name === xVar) ?? lab.variables[0];

  const logY = shouldUseLogResponse(obs.map((o) => o.output));
  const tf = (y: number) => (logY ? Math.log(Math.max(y, 1e-300)) : y);
  const inv = (t: number) => (logY ? Math.exp(t) : t);

  const ranked = useMemo(() => (snapshot ? rankAlive(snapshot.hypotheses) : []), [snapshot]);
  const leaderId = snapshot?.discovery?.hypothesisId ?? snapshot?.bestId;
  const leader: Hypothesis | undefined =
    snapshot?.hypotheses.find((h) => h.id === selectedId && h.fit?.ok) ?? snapshot?.hypotheses.find((h) => h.id === leaderId && h.fit?.ok);
  const curves = useMemo(() => {
    const list = [...ranked.slice(0, 3)];
    if (leader && !list.includes(leader)) list.unshift(leader);
    return list.slice(0, 4);
  }, [ranked, leader]);

  const ref0 = useMemo(
    () => Object.fromEntries(names.map((n) => [n, quantile(obs.map((o) => o.inputs[n]), 0.5)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obs],
  );

  const width = Math.max(size.width, 320);
  const iw = width - M.l - M.r;
  const ih = H - M.t - M.b;

  const data = useMemo(() => {
    if (!obs.length) return null;
    const lf = leader ? compile(leader.form, names) : null;
    const pred = (x: Record<string, number>) => (lf && leader?.fit ? lf(leader.fit.params, names.map((n) => x[n])) : NaN);
    const points = obs.map((o) => {
      const p = pred(o.inputs);
      const pRef = pred({ ...ref0, [xVar]: o.inputs[xVar] });
      const adj = Number.isFinite(p) && Number.isFinite(pRef) && (!logY || (p > 0 && pRef > 0)) ? inv(tf(o.output) - tf(p) + tf(pRef)) : o.output;
      return {
        o,
        x: mode === "slice" ? o.inputs[xVar] : Number.isFinite(p) ? p : o.output,
        y: mode === "slice" ? adj : o.output,
      };
    });
    const xs = Array.from({ length: 120 }, (_, i) => {
      const u = i / 119;
      return v.scale === "log" ? v.min * Math.pow(v.max / v.min, u) : v.min + u * (v.max - v.min);
    });
    const lines = curves.map((h) => {
      const f = compile(h.form, names);
      return {
        h,
        pts: xs
          .map((x) => ({ x, y: f(h.fit!.params, names.map((n) => (n === xVar ? x : ref0[n]))) }))
          .filter((p) => Number.isFinite(p.y) && (!logY || p.y > 0)),
      };
    });
    return { points, lines };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obs, leader, curves, xVar, mode, ref0, logY]);

  const scales = useMemo(() => {
    if (!data) return null;
    const ys = [...data.points.map((p) => p.y), ...(mode === "slice" ? data.lines.flatMap((l) => l.pts.map((p) => p.y)) : [])].filter(
      (y) => Number.isFinite(y) && (!logY || y > 0),
    );
    const obsY = data.points.map((p) => p.y).filter((y) => Number.isFinite(y) && (!logY || y > 0));
    // keep curves from blowing up the axis
    const lo = Math.min(...obsY);
    const hi = Math.max(...obsY);
    const pad = logY ? 1 : 0;
    const yMin = Math.max(Math.min(...ys), logY ? lo / 10 : lo - (hi - lo) * 0.6);
    const yMax = Math.min(Math.max(...ys), logY ? hi * 10 : hi + (hi - lo) * 0.6);
    let y: Scale;
    let x: Scale;
    if (logY) y = logScale(yMin * (1 - 0.05 * pad), yMax * (1 + 0.05 * pad), M.t + ih, M.t);
    else y = linearScale(yMin - (yMax - yMin) * 0.05, yMax + (yMax - yMin) * 0.05, M.t + ih, M.t);
    if (mode === "parity") {
      x = logY ? logScale(y.domain[0], y.domain[1], M.l, M.l + iw) : linearScale(y.domain[0], y.domain[1], M.l, M.l + iw);
    } else {
      x = v.scale === "log" ? logScale(v.min, v.max, M.l, M.l + iw) : linearScale(v.min, v.max, M.l, M.l + iw);
    }
    return { x, y };
  }, [data, mode, v, logY, iw, ih]);

  const lastCycle = snapshot?.cycle ?? 0;
  const hovered = hover !== null ? data?.points[hover] : null;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-line bg-surface p-0.5 text-xs">
          {(["slice", "parity"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 transition ${mode === m ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink"}`}
            >
              {m === "slice" ? "Partial residuals" : "Predicted vs observed"}
            </button>
          ))}
        </div>
        {mode === "slice" && (
          <div className="flex flex-wrap gap-1">
            {lab.variables.map((x) => (
              <button
                key={x.name}
                onClick={() => setXVar(x.name)}
                className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                  x.name === xVar ? "border-phosphor/60 text-phosphor" : "border-line text-ink-3 hover:text-ink"
                }`}
              >
                {x.name}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto font-mono text-[10px] text-ink-4">{logY ? "log scale" : "linear scale"}</span>
      </div>

      <div ref={ref} className="relative min-h-[300px] flex-1">
        {!data || !scales ? (
          <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-4">
            Measurements will appear here as the robot runs experiments.
          </div>
        ) : (
          <svg width={width} height={H} className="overflow-visible" onMouseLeave={() => setHover(null)}>
            {/* grid */}
            {scales.y.ticks.map((t) => (
              <g key={`y${t}`}>
                <line x1={M.l} x2={M.l + iw} y1={scales.y(t)} y2={scales.y(t)} stroke="var(--line)" strokeWidth="1" />
                <text x={M.l - 8} y={scales.y(t) + 3} textAnchor="end" fontSize="10" fill="var(--ink-4)" fontFamily="var(--font-geist-mono)">
                  {scales.y.format(t)}
                </text>
              </g>
            ))}
            {scales.x.ticks.map((t) => (
              <text key={`x${t}`} x={scales.x(t)} y={M.t + ih + 18} textAnchor="middle" fontSize="10" fill="var(--ink-4)" fontFamily="var(--font-geist-mono)">
                {scales.x.format(t)}
              </text>
            ))}
            <line x1={M.l} x2={M.l + iw} y1={M.t + ih} y2={M.t + ih} stroke="var(--line-strong)" />
            <text x={M.l + iw / 2} y={H - 2} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
              {mode === "slice" ? `${v.label}${v.unit ? ` (${v.unit})` : ""}` : `predicted ${lab.output.label} (${leader?.id ?? "—"})`}
            </text>
            <text x={12} y={M.t + ih / 2} textAnchor="middle" fontSize="11" fill="var(--ink-3)" transform={`rotate(-90 12 ${M.t + ih / 2})`}>
              {mode === "slice" && leader ? `${lab.output.label}, adjusted` : lab.output.label}
            </text>

            {mode === "parity" && (
              <line
                x1={scales.x(scales.y.domain[0])}
                y1={scales.y(scales.y.domain[0])}
                x2={scales.x(scales.y.domain[1])}
                y2={scales.y(scales.y.domain[1])}
                stroke="var(--ink-4)"
                strokeDasharray="4 4"
              />
            )}

            {/* model curves, with direct labels pushed apart so they never collide */}
            {mode === "slice" &&
              (() => {
                const drawn = data.lines
                  .map((l, i) => {
                    const pts = l.pts.filter((p) => p.y >= scales.y.domain[0] && p.y <= scales.y.domain[1]);
                    if (pts.length < 2) return null;
                    const end = pts[pts.length - 1];
                    return { l, i, pts, lx: scales.x(end.x) + 6, ly: scales.y(end.y) + 4 };
                  })
                  .filter((x): x is NonNullable<typeof x> => !!x);
                const byY = [...drawn].sort((a, b) => a.ly - b.ly);
                for (let k = 1; k < byY.length; k++) byY[k].ly = Math.max(byY[k].ly, byY[k - 1].ly + 13);
                return drawn.map(({ l, i, pts, lx, ly }) => {
                  const d = pts.map((p, j) => `${j ? "L" : "M"}${scales.x(p.x).toFixed(1)},${scales.y(p.y).toFixed(1)}`).join("");
                  const isLead = l.h.id === leader?.id;
                  return (
                    <g key={l.h.id}>
                      <path d={d} fill="none" stroke={SERIES[i]} strokeWidth={isLead ? 2.5 : 2} strokeDasharray={isLead ? undefined : "6 4"} opacity={isLead ? 1 : 0.85} />
                      <text x={lx} y={ly} fontSize="10.5" fill="var(--ink-2)" fontFamily="var(--font-geist-mono)">
                        <tspan fill={SERIES[i]}>■ </tspan>
                        {l.h.id}
                      </text>
                    </g>
                  );
                });
              })()}

            {/* observations */}
            {data.points.map((p, i) => {
              if (!Number.isFinite(p.y) || (logY && p.y <= 0)) return null;
              const cx = scales.x(p.x);
              const cy = scales.y(p.y);
              if (cy < M.t - 4 || cy > M.t + ih + 4) return null;
              const age = lastCycle - p.o.cycle;
              const fresh = age === 0;
              const opacity = Math.max(0.3, 1 - age * 0.14);
              return (
                <g key={p.o.id}>
                  {fresh && <circle cx={cx} cy={cy} r={5} fill="none" stroke="var(--phosphor)" className="ripple" />}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={hover === i ? 6 : 4}
                    fill={fresh ? "var(--phosphor)" : "var(--aqua)"}
                    opacity={opacity}
                    stroke="var(--surface)"
                    strokeWidth="1.5"
                  />
                  <circle cx={cx} cy={cy} r={10} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
        )}

        {hovered && scales && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-line-strong bg-surface/95 px-3 py-2 font-mono text-[11px] shadow-xl"
            style={{ left: Math.min(scales.x(hovered.x) + 12, width - 200), top: Math.max(scales.y(hovered.y) - 70, 0) }}
          >
            <div className="text-ink-3">
              run #{hovered.o.id} · cycle {hovered.o.cycle}
            </div>
            {lab.variables.map((x) => (
              <div key={x.name} className="text-ink-2">
                {x.name} = {fmt(hovered.o.inputs[x.name])} {x.unit}
              </div>
            ))}
            <div className="text-phosphor">
              {lab.output.name} = {fmt(hovered.o.output)} {lab.output.unit}
            </div>
          </div>
        )}
      </div>

      {data && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-phosphor" /> latest batch
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-aqua opacity-60" /> earlier (fades with age)
          </span>
          {mode === "slice" &&
            data.lines.map((l, i) => (
              <span key={l.h.id} className="flex items-center gap-1.5 font-mono">
                <svg width="18" height="6">
                  <line x1="0" x2="18" y1="3" y2="3" stroke={SERIES[i]} strokeWidth="2" strokeDasharray={l.h.id === leader?.id ? undefined : "4 3"} />
                </svg>
                {l.h.id} {l.h.label}
              </span>
            ))}
          {mode === "slice" && leader && (
            <span className="w-full text-ink-4">
              Points are adjusted with {leader.id} to the median of the other variables — if the law is right, they fall on its curve.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
