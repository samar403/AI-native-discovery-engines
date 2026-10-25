"use client";

import { useState } from "react";
import { fmt } from "@/engine/grammar";
import type { EngineSnapshot, Hypothesis } from "@/engine/types";
import { pct, STATUS } from "@/lib/ui";

function Spark({ h, cycles }: { h: Hypothesis; cycles: number }) {
  const W = 64;
  const Hh = 18;
  if (h.history.length < 2) return <svg width={W} height={Hh} />;
  const x = (c: number) => ((c - 1) / Math.max(cycles - 1, 1)) * (W - 4) + 2;
  const y = (w: number) => Hh - 2 - w * (Hh - 4);
  const d = h.history.map((p, i) => `${i ? "L" : "M"}${x(p.cycle).toFixed(1)},${y(p.weight).toFixed(1)}`).join("");
  const last = h.history[h.history.length - 1];
  return (
    <svg width={W} height={Hh} aria-hidden="true">
      <line x1={2} x2={W - 2} y1={Hh - 2} y2={Hh - 2} stroke="var(--line)" />
      <path d={d} fill="none" stroke={STATUS[h.status].color} strokeWidth="1.5" />
      <circle cx={x(last.cycle)} cy={y(last.weight)} r="2" fill={STATUS[h.status].color} />
    </svg>
  );
}

function Row({ h, cycles, selected, onSelect }: { h: Hypothesis; cycles: number; selected: boolean; onSelect: () => void }) {
  const st = STATUS[h.status];
  return (
    <button
      onClick={onSelect}
      className={`group grid w-full grid-cols-[18px_34px_1fr_64px] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition sm:grid-cols-[18px_34px_1fr_90px_64px] ${
        selected ? "bg-surface-3" : "hover:bg-surface-2"
      }`}
      title={h.statement}
    >
      <span style={{ color: st.color }} aria-label={st.label}>
        {st.icon}
      </span>
      <span className="font-mono text-[11px] text-ink-4">{h.id}</span>
      <span className="min-w-0">
        <span className={`block truncate font-mono text-[12px] ${h.status === "refuted" ? "text-ink-4 line-through decoration-rose/50" : "text-ink"}`}>
          {h.label}
        </span>
        <span className="block truncate text-[10.5px] text-ink-4">
          {h.origin} · {h.fit?.ok ? `CV R² ${fmt(h.fit.cvR2, 3)}` : h.status === "refuted" ? "falsified" : "awaiting data"}
        </span>
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${Math.max(h.weight * 100, h.weight > 0 ? 2 : 0)}%`, background: st.color, transition: "width .8s" }}
          />
        </span>
        <span className="w-9 text-right font-mono text-[10.5px] text-ink-3">{h.weight >= 0.001 ? pct(h.weight, 0) : "0%"}</span>
      </span>
      <Spark h={h} cycles={cycles} />
    </button>
  );
}

export function BeliefLedger({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: EngineSnapshot | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [showGrave, setShowGrave] = useState(false);
  if (!snapshot || !snapshot.hypotheses.length) {
    return <p className="px-2 py-6 text-center text-sm text-ink-4">No hypotheses yet — the theorist speaks first.</p>;
  }
  const alive = snapshot.hypotheses.filter((h) => h.status !== "refuted").sort((a, b) => b.weight - a.weight || (a.fit?.ok ? -1 : 1));
  const dead = snapshot.hypotheses.filter((h) => h.status === "refuted").reverse();
  return (
    <div className="space-y-0.5">
      {alive.map((h) => (
        <Row key={h.id} h={h} cycles={snapshot.cycle} selected={selectedId === h.id} onSelect={() => onSelect(selectedId === h.id ? null : h.id)} />
      ))}
      {dead.length > 0 && (
        <div className="pt-2">
          <button onClick={() => setShowGrave((s) => !s)} className="eyebrow flex w-full items-center gap-2 px-2 py-1 hover:text-ink">
            <span className="text-rose">✗</span> Graveyard · {dead.length} falsified <span className="ml-auto">{showGrave ? "−" : "+"}</span>
          </button>
          {showGrave &&
            dead.map((h) => (
              <div key={h.id}>
                <Row h={h} cycles={snapshot.cycle} selected={selectedId === h.id} onSelect={() => onSelect(selectedId === h.id ? null : h.id)} />
                {selectedId === h.id && h.verdict && <p className="px-9 pb-2 text-[11px] leading-snug text-rose/80">{h.verdict}</p>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
