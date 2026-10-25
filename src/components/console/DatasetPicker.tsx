"use client";

import { useState } from "react";
import { parseCsv, sampleGasCsv, type ParsedTable } from "@/engine/labs/dataset";
import type { DatasetConfig } from "@/engine/runner";

/** Upload a CSV and choose which columns are controllable inputs and which is the response. */
export function DatasetPicker({ value, onChange }: { value?: DatasetConfig; onChange: (d: DatasetConfig | undefined) => void }) {
  const [table, setTable] = useState<ParsedTable | null>(value ? parseCsv(value.csv) : null);
  const [csv, setCsv] = useState(value?.csv ?? "");
  const [name, setName] = useState(value?.name ?? "");
  const [output, setOutput] = useState(value?.output ?? "");
  const [inputs, setInputs] = useState<string[]>(value?.inputs ?? []);
  const [error, setError] = useState<string | null>(null);

  const load = (text: string, fileName: string) => {
    try {
      const t = parseCsv(text);
      setTable(t);
      setCsv(text);
      setName(fileName);
      const out = t.columns[t.columns.length - 1];
      setOutput(out);
      setInputs(t.columns.filter((c) => c !== out));
      setError(null);
      onChange({ name: fileName, csv: text, output: out, inputs: t.columns.filter((c) => c !== out) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const commit = (o: string, ins: string[]) => {
    setOutput(o);
    setInputs(ins);
    if (ins.length) onChange({ name, csv, output: o, inputs: ins });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="cursor-pointer rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-2 hover:text-ink">
          Upload CSV
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) load(await f.text(), f.name.replace(/\.\w+$/, ""));
            }}
          />
        </label>
        <button onClick={() => load(sampleGasCsv(), "Gas cylinder logs")} className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-3 hover:text-ink">
          Try sample: gas cylinders
        </button>
        <a href="/samples/gas-cylinders.csv" download className="self-center text-[11px] text-ink-4 underline-offset-2 hover:text-ink hover:underline">
          download sample
        </a>
      </div>
      {error && <p className="text-xs text-rose">{error}</p>}
      {table && (
        <div className="space-y-2 text-xs">
          <p className="text-ink-3">
            <span className="text-ink">{name}</span> · {table.rows.length} rows · {table.columns.length} numeric columns
          </p>
          <div>
            <div className="eyebrow mb-1 !text-[10px]">response (what to explain)</div>
            <select
              value={output}
              onChange={(e) => commit(e.target.value, inputs.filter((i) => i !== e.target.value))}
              className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-mono text-ink"
            >
              {table.columns.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="eyebrow mb-1 !text-[10px]">candidate causes</div>
            <div className="flex flex-wrap gap-1">
              {table.columns
                .filter((c) => c !== output)
                .map((c) => {
                  const on = inputs.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => commit(output, on ? inputs.filter((i) => i !== c) : [...inputs, c].slice(0, 6))}
                      className={`rounded-full border px-2 py-0.5 font-mono ${on ? "border-aqua/60 text-aqua" : "border-line text-ink-4"}`}
                    >
                      {on ? "✓ " : ""}
                      {c}
                    </button>
                  );
                })}
            </div>
          </div>
          <p className="text-[10.5px] leading-snug text-ink-4">
            Rows become an oracle pool: the engine decides which rows to reveal, so it must find the law with as few as possible.
          </p>
        </div>
      )}
    </div>
  );
}
