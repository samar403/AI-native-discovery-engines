"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { claudeStatus } from "@/engine/agents/claude";
import { fmtR2 } from "@/engine/grammar";
import { LABS, getLab } from "@/engine/labs";
import { createDatasetLab, parseCsv } from "@/engine/labs/dataset";
import type { DatasetConfig, RunConfig } from "@/engine/runner";
import type { Lab } from "@/engine/types";
import { Reactor } from "@/components/reactor/Reactor";
import { EvidenceField } from "@/components/charts/EvidenceField";
import { BeliefLedger } from "@/components/console/BeliefLedger";
import { Notebook } from "@/components/console/Notebook";
import { DesignMap, ImportancePanel } from "@/components/console/Insights";
import { EurekaModal } from "@/components/console/EurekaModal";
import { DatasetPicker } from "@/components/console/DatasetPicker";
import { SPEEDS, useDiscovery } from "@/hooks/useDiscovery";
import { PHASES, pct, STATUS } from "@/lib/ui";

interface RecentRun {
  labId: string;
  labName: string;
  seed: number;
  theorist: RunConfig["theorist"];
  designMode: RunConfig["designMode"];
  at: number;
  discovered: boolean;
  equation?: string;
  experiments: number;
}

const RECENT_KEY = "eureka.recent-runs.v1";

function loadRecent(): RecentRun[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function Panel({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel p-4 ${className}`}>
      <header className="mb-3 flex items-center gap-2">
        <h2 className="eyebrow">{title}</h2>
        <div className="ml-auto">{right}</div>
      </header>
      {children}
    </section>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; disabled?: boolean; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-flow-col rounded-xl border border-line bg-surface p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          disabled={o.disabled}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-2 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-35 ${value === o.value ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LabConsole() {
  const params = useSearchParams();
  const [labId, setLabId] = useState(params.get("lab") ?? "kepler");
  const [dataset, setDataset] = useState<DatasetConfig | undefined>();
  const [theorist, setTheorist] = useState<RunConfig["theorist"]>("builtin");
  const [designMode, setDesignMode] = useState<RunConfig["designMode"]>("adaptive");
  const [seed, setSeed] = useState(7);
  const [budget, setBudget] = useState<number | null>(null);
  const [batch, setBatch] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [claude, setClaude] = useState<{ enabled: boolean; model?: string }>({ enabled: false });
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const run = useDiscovery();

  useEffect(() => {
    claudeStatus().then(setClaude);
    setRecent(loadRecent());
  }, []);

  const lab: Lab | null = useMemo(() => {
    if (labId === "dataset") {
      if (!dataset) return null;
      try {
        return createDatasetLab(parseCsv(dataset.csv), dataset.inputs, dataset.output, dataset.name);
      } catch {
        return null;
      }
    }
    return getLab(labId) ?? null;
  }, [labId, dataset]);

  // the lab whose run is on screen (may differ from the picker while browsing)
  const shownLab: Lab | null = useMemo(() => {
    const sid = run.snapshot?.labId;
    if (!sid) return lab;
    if (sid === "dataset") return lab?.id === "dataset" ? lab : run.config?.dataset ? createDatasetLab(parseCsv(run.config.dataset.csv), run.config.dataset.inputs, run.config.dataset.output, run.config.dataset.name) : lab;
    return getLab(sid) ?? lab;
  }, [run.snapshot?.labId, lab, run.config]);

  const effBudget = budget ?? lab?.defaultBudget ?? 48;
  const effBatch = batch ?? lab?.defaultBatch ?? 8;

  const start = (overrides: Partial<RunConfig> = {}) => {
    if (!lab) return;
    setSelected(null);
    setModal(false);
    run.start({ labId, seed, budget: effBudget, batch: effBatch, theorist, designMode, dataset: labId === "dataset" ? dataset : undefined, ...overrides });
  };

  useEffect(() => {
    if (params.get("autostart") === "1") start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (run.lastEvent?.type === "discovery") setModal(true);
    if (run.lastEvent?.type === "done" && run.liveSnapshot && run.config) {
      const s = run.liveSnapshot;
      const best = s.hypotheses.find((h) => h.id === (s.discovery?.hypothesisId ?? s.bestId));
      const entry: RecentRun = {
        labId: run.config.labId,
        labName: shownLab?.name ?? run.config.labId,
        seed: run.config.seed,
        theorist: run.config.theorist,
        designMode: run.config.designMode,
        at: Date.now(),
        discovered: !!s.discovery,
        equation: best?.fit?.equation,
        experiments: s.observations.length,
      };
      const next = [entry, ...loadRecent()].slice(0, 8);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      setRecent(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.lastEvent]);

  const snap = run.snapshot;
  const alive = snap?.hypotheses.filter((h) => h.status !== "refuted").length ?? 0;
  const dead = snap?.hypotheses.filter((h) => h.status === "refuted").length ?? 0;
  const leader = snap?.hypotheses.find((h) => h.id === (snap.discovery?.hypothesisId ?? snap.bestId));
  const phaseInfo = PHASES.find((p) => p.id === snap?.phase);
  const running = run.status === "running";
  const used = snap?.observations.length ?? 0;

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-16 pt-6 sm:px-6">
      {/* header */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="eyebrow">lab console · {shownLab?.field ?? "choose a lab"}</div>
          <h1 className="font-display mt-1 text-4xl italic sm:text-5xl">{shownLab?.name ?? "Your dataset"}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-3">{shownLab?.question}</p>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:ml-auto lg:min-w-[620px]">
          <div className="rounded-xl border border-line bg-surface/70 px-3 py-2">
            <dt className="eyebrow !text-[10px]">cycle</dt>
            <dd className="font-mono text-lg">{snap?.cycle ?? 0}</dd>
          </div>
          <div className="rounded-xl border border-line bg-surface/70 px-3 py-2">
            <dt className="eyebrow !text-[10px]">experiments</dt>
            <dd className="font-mono text-lg">
              {used}
              <span className="text-ink-4">/{snap?.budget ?? effBudget}</span>
            </dd>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full bg-aqua transition-all" style={{ width: `${(used / (snap?.budget ?? effBudget)) * 100}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-line bg-surface/70 px-3 py-2">
            <dt className="eyebrow !text-[10px]">hypotheses</dt>
            <dd className="font-mono text-lg">
              {alive} <span className="text-sm text-rose">✗{dead}</span>
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-surface/70 px-3 py-2">
            <dt className="eyebrow !text-[10px]">leader</dt>
            <dd className="truncate font-mono text-sm" title={leader?.label}>
              {leader ? (
                <>
                  <span style={{ color: STATUS[leader.status].color }}>{STATUS[leader.status].icon}</span> {leader.label}
                </>
              ) : (
                "—"
              )}
            </dd>
            <dd className="font-mono text-[11px] text-ink-3">{snap ? `p=${pct(snap.confidence)} · R² ${leader?.fit?.ok ? fmtR2(leader.fit.cvR2) : "—"}` : ""}</dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)_400px]">
        {/* ── rail ── */}
        <aside className="space-y-4">
          <Panel title="1 · choose a world">
            <div className="space-y-1.5">
              {LABS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    setLabId(l.id);
                    setBudget(null);
                    setBatch(null);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                    labId === l.id ? "border-line-strong bg-surface-3" : "border-transparent hover:bg-surface-2"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg" style={{ background: `${l.hue}18`, color: l.hue }}>
                    {l.glyph}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{l.name}</span>
                    <span className="block truncate text-[11px] text-ink-4">{l.tagline}</span>
                  </span>
                </button>
              ))}
              <button
                onClick={() => {
                  setLabId("dataset");
                  setBudget(null);
                  setBatch(null);
                }}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                  labId === "dataset" ? "border-line-strong bg-surface-3" : "border-dashed border-line hover:bg-surface-2"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f5a52418] text-lg text-[#f5a524]">▦</span>
                <span>
                  <span className="block text-sm text-ink">Bring your own data</span>
                  <span className="block text-[11px] text-ink-4">CSV → law, actively sampled</span>
                </span>
              </button>
            </div>
            {labId === "dataset" && (
              <div className="mt-3 border-t border-line pt-3">
                <DatasetPicker value={dataset} onChange={setDataset} />
              </div>
            )}
          </Panel>

          <Panel title="2 · configure the loop">
            <div className="space-y-3 text-xs">
              <div>
                <div className="mb-1 text-ink-3">Theorist</div>
                <Segmented
                  value={theorist}
                  onChange={setTheorist}
                  options={[
                    { value: "builtin", label: "Built-in" },
                    {
                      value: "claude",
                      label: "✺ Claude",
                      disabled: !claude.enabled,
                      hint: claude.enabled ? `Uses ${claude.model}` : "Set ANTHROPIC_API_KEY on the server to enable",
                    },
                  ]}
                />
                {!claude.enabled && <p className="mt-1 text-[10.5px] text-ink-4">Claude needs ANTHROPIC_API_KEY on the server.</p>}
              </div>
              <div>
                <div className="mb-1 text-ink-3">Experiment design</div>
                <Segmented
                  value={designMode}
                  onChange={setDesignMode}
                  options={[
                    { value: "adaptive", label: "Adaptive" },
                    { value: "random", label: "Random (baseline)" },
                  ]}
                />
              </div>
              <label className="block">
                <span className="flex justify-between text-ink-3">
                  Budget <span className="font-mono text-ink">{effBudget} runs</span>
                </span>
                <input
                  type="range"
                  min={16}
                  max={Math.min(200, lab?.maxExperiments ?? 200)}
                  step={4}
                  value={effBudget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <label className="block">
                <span className="flex justify-between text-ink-3">
                  Batch per cycle <span className="font-mono text-ink">{effBatch}</span>
                </span>
                <input type="range" min={4} max={16} value={effBatch} onChange={(e) => setBatch(Number(e.target.value))} className="w-full" />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-ink-3">Seed</span>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 0)}
                  className="w-20 rounded-lg border border-line bg-surface-2 px-2 py-1 font-mono text-ink"
                />
                <button onClick={() => setSeed(Math.floor(Math.random() * 9999))} className="rounded-lg border border-line px-2 py-1 text-ink-3 hover:text-ink" title="Random seed">
                  ⚄
                </button>
              </div>
            </div>
            <button
              onClick={() => start()}
              disabled={!lab}
              className="mt-4 w-full rounded-xl bg-phosphor py-2.5 text-sm font-semibold text-black shadow-[0_0_30px_rgba(255,181,71,0.25)] transition hover:brightness-110 disabled:opacity-40"
            >
              {run.status === "idle" ? "▶ Start discovery" : "↻ Restart with these settings"}
            </button>
          </Panel>

          {recent.length > 0 && (
            <Panel title="recent runs">
              <ul className="space-y-1.5">
                {recent.map((r) => (
                  <li key={r.at}>
                    <button
                      onClick={() => {
                        if (r.labId === "dataset") return;
                        setLabId(r.labId);
                        setSeed(r.seed);
                        setTheorist(r.theorist);
                        setDesignMode(r.designMode);
                        run.start({ labId: r.labId, seed: r.seed, theorist: r.theorist, designMode: r.designMode });
                      }}
                      className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                      title="Replay this run (same seed)"
                    >
                      <span className="flex items-center gap-2 text-xs">
                        <span className={r.discovered ? "text-aqua" : "text-ink-4"}>{r.discovered ? "✦" : "○"}</span>
                        <span className="text-ink-2">{r.labName}</span>
                        <span className="ml-auto font-mono text-[10px] text-ink-4">
                          s{r.seed} · {r.experiments} runs
                        </span>
                      </span>
                      {r.equation && <span className="block truncate pl-5 font-mono text-[10.5px] text-ink-4">{r.equation}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>

        {/* ── centre (first on small screens) ── */}
        <div className="order-first min-w-0 space-y-4 xl:order-none">
          <section className="panel relative overflow-hidden p-3 sm:p-5">
            <div className="absolute left-5 top-4 z-10 max-w-[60%]">
              <div className="eyebrow">{snap ? `cycle ${snap.cycle}` : "ready"}</div>
              <div className="mt-0.5 text-sm text-ink-2">
                {run.status === "error"
                  ? <span className="text-rose">{run.error}</span>
                  : snap?.done
                    ? snap.stopReason
                    : phaseInfo
                      ? `${phaseInfo.verb}${run.computing ? "…" : ""}`
                      : "Pick a world and start the loop."}
              </div>
            </div>
            <div className="absolute right-4 top-4 z-10 hidden text-right text-[10.5px] leading-relaxed text-ink-4 sm:block">
              closer to centre = more probable
              <br />
              <span style={{ color: STATUS.testing.color }}>◐ testing</span> · <span style={{ color: STATUS.supported.color }}>✓ supported</span> ·{" "}
              <span style={{ color: STATUS.refuted.color }}>✗ falsified</span>
            </div>
            <Reactor snapshot={snap} selectedId={selected} onSelect={setSelected} computing={run.computing} />

            {/* transport */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {running ? (
                <button onClick={run.pause} className="rounded-full border border-line-strong px-4 py-1.5 text-sm hover:bg-surface-3">
                  ❚❚ Pause
                </button>
              ) : run.status === "paused" ? (
                <>
                  <button onClick={run.resume} className="rounded-full bg-phosphor px-4 py-1.5 text-sm font-medium text-black">
                    ▶ Resume
                  </button>
                  <button onClick={run.stepOnce} className="rounded-full border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-3" title="Advance one event">
                    Step ›
                  </button>
                </>
              ) : (
                <button onClick={() => start()} disabled={!lab} className="rounded-full bg-phosphor px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40">
                  ▶ {run.status === "idle" ? "Start" : "Run again"}
                </button>
              )}
              <div className="flex rounded-full border border-line bg-surface p-0.5 font-mono text-[11px]" role="group" aria-label="Playback speed">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => run.setSpeed(s)}
                    className={`rounded-full px-2.5 py-1 ${run.speed === s ? "bg-surface-3 text-ink" : "text-ink-4 hover:text-ink"}`}
                  >
                    {s === 16 ? "⏭" : `${s}×`}
                  </button>
                ))}
              </div>
              {snap?.done && (
                <button onClick={() => setModal(true)} className="rounded-full border border-phosphor/50 px-4 py-1.5 text-sm text-phosphor hover:bg-phosphor/10">
                  {snap.discovery ? "✦ View discovery" : "View summary"}
                </button>
              )}
              {/* timeline */}
              {run.keyframes.length > 0 && (
                <div className="flex w-full flex-wrap items-center gap-1 pt-1 sm:ml-auto sm:w-auto">
                  <span className="eyebrow mr-1 !text-[10px]">rewind</span>
                  {run.keyframes.map((k, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        run.pause();
                        run.setViewIndex(i);
                      }}
                      className={`rounded-md px-2 py-0.5 font-mono text-[11px] ${
                        run.viewIndex === i ? "bg-phosphor text-black" : k.label === "Eureka" ? "text-[var(--st-discovered)] hover:bg-surface-3" : "text-ink-3 hover:bg-surface-3"
                      }`}
                    >
                      {k.label === "Eureka" ? "✦" : k.label === "End" ? "■" : `c${k.cycle}`}
                    </button>
                  ))}
                  {run.viewIndex !== null && (
                    <button onClick={() => run.setViewIndex(null)} className="rounded-md px-2 py-0.5 text-[11px] text-aqua hover:bg-surface-3">
                      live ›
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {shownLab && (
            <Panel title="evidence field" right={<span className="text-[10.5px] text-ink-4">{selected ? `showing ${selected}` : "click a hypothesis to inspect it"}</span>}>
              <EvidenceField snapshot={snap} lab={shownLab} selectedId={selected} />
            </Panel>
          )}

          {shownLab && (
            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="ablation · what matters">
                <ImportancePanel snapshot={snap} lab={shownLab} />
              </Panel>
              <Panel title="design space · where it measured">
                <DesignMap key={shownLab.id} snapshot={snap} lab={shownLab} />
              </Panel>
            </div>
          )}
        </div>

        {/* ── right ── */}
        <div className="space-y-4">
          <Panel
            title="lab notebook"
            right={<span className="font-mono text-[10px] text-ink-4">{snap?.agentName ?? ""}</span>}
            className="flex h-[520px] flex-col"
          >
            <div className="min-h-0 flex-1">
              <Notebook entries={snap?.notebook ?? []} live={running && run.viewIndex === null} />
            </div>
          </Panel>
          <Panel title="belief ledger" right={<span className="text-[10.5px] text-ink-4">posterior · trend</span>}>
            <div className="scroll-thin max-h-[560px] overflow-y-auto pr-1">
              <BeliefLedger snapshot={snap} selectedId={selected} onSelect={setSelected} />
            </div>
            {selected && snap && (() => {
              const h = snap.hypotheses.find((x) => x.id === selected);
              if (!h) return null;
              return (
                <div className="rise mt-3 rounded-xl border border-line bg-surface-2 p-3 text-xs">
                  <div className="font-mono text-ink">{h.id} · {h.label}</div>
                  <p className="mt-1 text-ink-2">{h.statement}</p>
                  <p className="mt-1 text-ink-4">Why: {h.rationale}</p>
                  {h.fit?.ok && <div className="mt-2 break-words font-mono text-[11px] text-aqua">{h.fit.equation}</div>}
                  {h.verdict && <p className="mt-2 text-rose">{h.verdict}</p>}
                </div>
              );
            })()}
          </Panel>
        </div>
      </div>

      {snap && shownLab && <EurekaModal snapshot={snap} lab={shownLab} open={modal} onClose={() => setModal(false)} claudeEnabled={claude.enabled} />}
    </div>
  );
}
