"use client";

import { useState } from "react";
import { toUnit } from "@/engine/design";
import { fmt } from "@/engine/grammar";
import type { DesignStrategy, EngineSnapshot, Lab } from "@/engine/types";
import { useSize } from "@/hooks/useSize";
import { SERIES } from "@/lib/ui";

const VERDICT = {
  essential: { icon: "●", label: "essential", color: "var(--aqua)" },
  minor: { icon: "◐", label: "minor", color: "var(--phosphor)" },
  irrelevant: { icon: "○", label: "no effect", color: "var(--ink-4)" },
} as const;

/** Variable ablation: ΔBIC paid when a variable is removed from (or gained when added to) the leader. */
export function ImportancePanel({ snapshot, lab }: { snapshot: EngineSnapshot | null; lab: Lab }) {
  const imp = snapshot?.importance ?? [];
  if (!imp.length) return <p className="py-4 text-center text-sm text-ink-4">Ablation runs after the first analysis.</p>;
  const max = Math.max(...imp.map((i) => Math.log10(1 + Math.max(i.deltaBic, 0))), 1);
  return (
    <div className="space-y-2.5">
      {imp.map((i) => {
        const v = lab.variables.find((x) => x.name === i.variable);
        const w = Math.log10(1 + Math.max(i.deltaBic, 0)) / max;
        const vd = VERDICT[i.verdict];
        return (
          <div key={i.variable}>
            <div className="mb-1 flex items-baseline gap-2 text-xs">
              <span className="font-mono text-ink">{i.variable}</span>
              <span className="truncate text-ink-3">{v?.label}</span>
              <span className="ml-auto whitespace-nowrap" style={{ color: vd.color }}>
                {vd.icon} {vd.label}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-surface-3">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w * 100}%`, background: vd.color, transition: "width .8s" }} />
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-ink-4">
              {i.inBest ? `in law · removing it costs ΔBIC ${fmt(i.deltaBic, 3)}` : `not in law · adding it gains ΔBIC ${fmt(Math.max(i.deltaBic, 0), 2)}`}
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[10.5px] leading-snug text-ink-4">ΔBIC &gt; 10 is decisive evidence; 2–10 positive; &lt; 2 not worth a parameter.</p>
    </div>
  );
}

const STRAT: Record<DesignStrategy, { label: string; color: string }> = {
  screening: { label: "screening", color: SERIES[3] },
  discriminate: { label: "discriminate", color: SERIES[0] },
  optimize: { label: "optimize", color: SERIES[1] },
  random: { label: "random", color: SERIES[2] },
};

/** Where the engine chose to measure: the design space, coloured by design strategy. */
export function DesignMap({ snapshot, lab }: { snapshot: EngineSnapshot | null; lab: Lab }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [axes, setAxes] = useState<[string, string]>([lab.variables[0].name, lab.variables[1]?.name ?? lab.variables[0].name]);
  const vx = lab.variables.find((v) => v.name === axes[0]) ?? lab.variables[0];
  const vy = lab.variables.find((v) => v.name === axes[1]) ?? lab.variables[1] ?? lab.variables[0];
  const W = Math.max(size.width, 220);
  const Hh = 220;
  const pad = 26;
  const sx = (x: number) => pad + toUnit(vx, x) * (W - pad - 8);
  const sy = (y: number) => Hh - pad - toUnit(vy, y) * (Hh - pad - 8);
  const designs = new Map((snapshot?.designs ?? []).map((d) => [d.id, d.strategy]));
  const used = new Set((snapshot?.designs ?? []).map((d) => d.strategy));
  const opt = snapshot?.discovery?.optimum;

  return (
    <div ref={ref}>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px]">
        {lab.variables.map((v) => (
          <button
            key={v.name}
            onClick={() => setAxes(([a, b]) => (a === v.name ? [b, a] : [b, v.name]))}
            className={`rounded-full border px-2 py-0.5 font-mono transition ${
              axes.includes(v.name) ? "border-aqua/50 text-aqua" : "border-line text-ink-3 hover:text-ink"
            }`}
          >
            {v.name}
          </button>
        ))}
        <span className="ml-auto text-ink-4">
          x: {vx.name} · y: {vy.name}
        </span>
      </div>
      <svg width={W} height={Hh} role="img" aria-label="Experiment locations in the design space">
        <rect x={pad} y={8} width={W - pad - 8} height={Hh - pad - 8} fill="none" stroke="var(--line)" rx="6" />
        {[0.25, 0.5, 0.75].map((u) => (
          <g key={u}>
            <line x1={pad + u * (W - pad - 8)} x2={pad + u * (W - pad - 8)} y1={8} y2={Hh - pad} stroke="var(--line)" strokeDasharray="2 4" />
            <line y1={8 + u * (Hh - pad - 8)} y2={8 + u * (Hh - pad - 8)} x1={pad} x2={W - 8} stroke="var(--line)" strokeDasharray="2 4" />
          </g>
        ))}
        <text x={pad} y={Hh - 8} fontSize="9.5" fill="var(--ink-4)" fontFamily="var(--font-geist-mono)">
          {fmt(vx.min)}
        </text>
        <text x={W - 8} y={Hh - 8} fontSize="9.5" fill="var(--ink-4)" textAnchor="end" fontFamily="var(--font-geist-mono)">
          {fmt(vx.max)} {vx.unit}
        </text>
        <text x={pad - 4} y={Hh - pad} fontSize="9.5" fill="var(--ink-4)" textAnchor="end" fontFamily="var(--font-geist-mono)">
          {fmt(vy.min)}
        </text>
        <text x={pad - 4} y={16} fontSize="9.5" fill="var(--ink-4)" textAnchor="end" fontFamily="var(--font-geist-mono)">
          {fmt(vy.max)}
        </text>
        {(snapshot?.observations ?? []).map((o) => {
          const s = designs.get(o.designId) ?? "screening";
          const fresh = o.cycle === snapshot!.cycle;
          return (
            <g key={o.id}>
              {fresh && <circle cx={sx(o.inputs[vx.name])} cy={sy(o.inputs[vy.name])} r={4} fill="none" stroke={STRAT[s].color} className="ripple" />}
              <circle cx={sx(o.inputs[vx.name])} cy={sy(o.inputs[vy.name])} r={fresh ? 4.5 : 3.5} fill={STRAT[s].color} stroke="var(--surface)" strokeWidth="1.5" opacity={fresh ? 1 : 0.75} />
            </g>
          );
        })}
        {opt && (
          <g transform={`translate(${sx(opt.inputs[vx.name])},${sy(opt.inputs[vy.name])})`}>
            <circle r="9" fill="none" stroke="var(--st-discovered)" strokeWidth="1.5" />
            <text y="4" textAnchor="middle" fontSize="11" fill="var(--st-discovered)">
              ✦
            </text>
          </g>
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[10.5px] text-ink-3">
        {(Object.keys(STRAT) as DesignStrategy[])
          .filter((k) => used.has(k))
          .map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: STRAT[k].color }} />
              {STRAT[k].label}
            </span>
          ))}
        {opt && <span className="text-[var(--st-discovered)]">✦ predicted optimum</span>}
      </div>
    </div>
  );
}
