"use client";

import { useRef, useState } from "react";
import { benchmarkRun, summarize, type BenchRun, type BenchSummary } from "@/engine/benchmark";
import { LABS, getLab } from "@/engine/labs";
import { useSize } from "@/hooks/useSize";
import { SERIES } from "@/lib/ui";

type Job = { labId: string; mode: "adaptive" | "random"; seed: number };

const MODE_COLOR = { adaptive: SERIES[0], random: SERIES[1] } as const;

function Bars({ summary, metric }: { summary: BenchSummary[]; metric: "exps" | "rate" }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const W = Math.max(size.width, 300);
  const H = 240;
  const m = { l: 40, r: 8, t: 16, b: 34 };
  const labs = LABS.filter((l) => summary.some((s) => s.labId === l.id));
  const val = (s?: BenchSummary) => (!s ? 0 : metric === "exps" ? s.meanExperimentsToDiscovery ?? 0 : s.discoveryRate * 100);
  const rawMax = metric === "rate" ? 100 : Math.max(...summary.map((s) => val(s)), 10) * 1.1;
  const step = metric === "rate" ? 25 : rawMax > 80 ? 20 : 10;
  const max = Math.ceil(rawMax / step) * step;
  const gw = (W - m.l - m.r) / Math.max(labs.length, 1);
  const bw = Math.min(28, gw / 3);
  const y = (v: number) => m.t + (1 - v / max) * (H - m.t - m.b);
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} role="img" aria-label={metric === "exps" ? "Mean experiments to discovery" : "Discovery rate"}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={m.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--ink-4)" fontFamily="var(--font-geist-mono)">
              {t}
              {metric === "rate" ? "%" : ""}
            </text>
          </g>
        ))}
        {labs.map((l, i) => {
          const cx = m.l + gw * i + gw / 2;
          return (
            <g key={l.id}>
              {(["adaptive", "random"] as const).map((mode, j) => {
                const s = summary.find((x) => x.labId === l.id && x.mode === mode);
                const v = val(s);
                const x = cx + (j === 0 ? -bw - 1 : 1);
                const key = `${l.id}-${mode}`;
                return (
                  <g key={mode} onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)}>
                    <rect x={x - 4} y={m.t} width={bw + 8} height={H - m.t - m.b} fill="transparent" />
                    {v > 0 && (
                      <path
                        d={`M${x},${y(0)} V${y(v) + 4} Q${x},${y(v)} ${x + 4},${y(v)} H${x + bw - 4} Q${x + bw},${y(v)} ${x + bw},${y(v) + 4} V${y(0)} Z`}
                        fill={MODE_COLOR[mode]}
                        opacity={hover && hover !== key ? 0.5 : 1}
                      />
                    )}
                    {v > 0 && (
                      <text x={x + bw / 2} y={y(v) - 5} textAnchor="middle" fontSize="10" fill="var(--ink-2)" fontFamily="var(--font-geist-mono)">
                        {metric === "rate" ? `${Math.round(v)}%` : v.toFixed(0)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={cx} y={H - 14} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
                {l.name.split(" ")[0]}
              </text>
            </g>
          );
        })}
        <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />
      </svg>
      {hover &&
        (() => {
          const [labId, mode] = hover.split("-") as [string, "adaptive" | "random"];
          const s = summary.find((x) => x.labId === labId && x.mode === mode);
          if (!s) return null;
          return (
            <div className="pointer-events-none absolute right-2 top-0 rounded-lg border border-line-strong bg-surface/95 px-3 py-2 text-[11px] shadow-xl">
              <div className="text-ink">
                {getLab(labId)?.name} · {mode}
              </div>
              <div className="font-mono text-ink-3">
                laws found {Math.round(s.discoveryRate * 100)}% of {s.runs} runs
              </div>
              <div className="font-mono text-ink-3">mean experiments → law {s.meanExperimentsToDiscovery?.toFixed(1) ?? "—"}</div>
              <div className="font-mono text-ink-3">truth match {s.meanTruthScore.toFixed(0)}/100</div>
            </div>
          );
        })()}
    </div>
  );
}

export function BenchmarkClient() {
  const [seeds, setSeeds] = useState(3);
  const [runs, setRuns] = useState<BenchRun[]>([]);
  const [total, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const worker = useRef<Worker | null>(null);

  const start = () => {
    worker.current?.terminate();
    const jobs: Job[] = LABS.flatMap((l) => (["adaptive", "random"] as const).flatMap((mode) => Array.from({ length: seeds }, (_, i) => ({ labId: l.id, mode, seed: i + 1 }))));
    setRuns([]);
    setTotal(jobs.length);
    setRunning(true);
    try {
      const w = new Worker(new URL("../../engine/worker.ts", import.meta.url), { type: "module" });
      worker.current = w;
      w.onmessage = (e) => {
        if (e.data.type === "bench-result") setRuns((r) => [...r, e.data.run]);
        if (e.data.type === "end" || e.data.type === "error") setRunning(false);
      };
      w.postMessage({ type: "bench", jobs });
    } catch {
      // inline fallback
      (async () => {
        for (const j of jobs) {
          const r = await benchmarkRun(getLab(j.labId)!, j.mode, j.seed);
          setRuns((x) => [...x, r]);
          await new Promise((res) => setTimeout(res, 0));
        }
        setRunning(false);
      })();
    }
  };

  const summary = summarize(runs);

  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-center gap-4 p-5">
        <label className="flex items-center gap-3 text-sm text-ink-3">
          Seeds per lab & mode
          <input type="range" min={1} max={8} value={seeds} onChange={(e) => setSeeds(Number(e.target.value))} disabled={running} />
          <span className="font-mono text-ink">{seeds}</span>
        </label>
        <span className="text-xs text-ink-4">{LABS.length * 2 * seeds} full discovery runs · runs in a background worker</span>
        <button onClick={start} disabled={running} className="ml-auto rounded-full bg-phosphor px-5 py-2 text-sm font-medium text-black disabled:opacity-50">
          {running ? `Running… ${runs.length}/${total}` : runs.length ? "Run again" : "▶ Run benchmark"}
        </button>
        {running && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
            <div className="h-full bg-phosphor transition-all" style={{ width: `${(runs.length / Math.max(total, 1)) * 100}%` }} />
          </div>
        )}
      </div>

      {summary.length > 0 && (
        <>
          <div className="flex flex-wrap gap-4 text-xs text-ink-3">
            <span className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: MODE_COLOR.adaptive }} /> Adaptive loop (discriminating designs)
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: MODE_COLOR.random }} /> Random designs (same theorist & analysis)
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel p-5">
              <h2 className="eyebrow mb-1">laws established</h2>
              <p className="mb-3 text-xs text-ink-4">Share of runs that met every discovery criterion within budget. Higher is better.</p>
              <Bars summary={summary} metric="rate" />
            </section>
            <section className="panel p-5">
              <h2 className="eyebrow mb-1">experiments to discovery</h2>
              <p className="mb-3 text-xs text-ink-4">Mean experiments used by successful runs. Lower is better.</p>
              <Bars summary={summary} metric="exps" />
            </section>
          </div>
          <section className="panel overflow-x-auto p-5">
            <h2 className="eyebrow mb-3">table view</h2>
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-ink-4">
                <tr>
                  <th className="py-2 font-normal">Lab</th>
                  <th className="font-normal">Design</th>
                  <th className="font-normal">Runs</th>
                  <th className="font-normal">Laws found</th>
                  <th className="font-normal">Experiments → law</th>
                  <th className="font-normal">Truth match</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[13px]">
                {summary.map((s) => (
                  <tr key={`${s.labId}-${s.mode}`} className="border-t border-line">
                    <td className="py-2 font-sans text-ink">{getLab(s.labId)?.name}</td>
                    <td style={{ color: MODE_COLOR[s.mode] }}>{s.mode}</td>
                    <td className="text-ink-3">{s.runs}</td>
                    <td>{Math.round(s.discoveryRate * 100)}%</td>
                    <td>{s.meanExperimentsToDiscovery?.toFixed(1) ?? "—"}</td>
                    <td>{s.meanTruthScore.toFixed(0)}/100</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
