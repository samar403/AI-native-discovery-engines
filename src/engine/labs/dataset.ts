/**
 * Bring-your-own-data lab. An uploaded table becomes an *oracle pool*: each designed
 * experiment is realised by the closest not-yet-revealed row, so the engine still has
 * to choose which measurements to "buy" (pool-based active learning).
 */
import type { Inputs, Lab, Variable } from "../types";

export interface ParsedTable {
  columns: string[];
  rows: Record<string, number>[];
}

export function parseCsv(text: string): ParsedTable {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length && !l.startsWith("#"));
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one data row.");
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const split = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  const header = split(lines[0]);
  const raw = lines.slice(1).map(split);
  const numeric = header.filter((_, j) => raw.every((r) => r[j] !== undefined && r[j] !== "" && Number.isFinite(Number(r[j]))));
  if (numeric.length < 2) throw new Error("Need at least two fully numeric columns.");
  const rows = raw.map((r) => Object.fromEntries(numeric.map((c) => [c, Number(r[header.indexOf(c)])])));
  return { columns: numeric, rows };
}

const sanitize = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1") || "x";

export function createDatasetLab(table: ParsedTable, inputCols: string[], outputCol: string, name = "Your dataset"): Lab {
  if (!inputCols.length) throw new Error("Choose at least one input column.");
  const variables: Variable[] = inputCols.map((c) => {
    const vals = table.rows.map((r) => r[c]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return {
      name: sanitize(c),
      label: c,
      unit: "",
      min,
      max: max > min ? max : min + 1,
      scale: min > 0 && max / min > 30 ? "log" : "linear",
    };
  });
  const pool = table.rows.map((r) => ({
    inputs: Object.fromEntries(inputCols.map((c, j) => [variables[j].name, r[c]])) as Inputs,
    output: r[outputCol],
  }));
  const used = new Set<number>();

  const norm = (v: Variable, x: number) =>
    v.scale === "log" ? Math.log(x / v.min) / Math.log(v.max / v.min) : (x - v.min) / (v.max - v.min);

  const nearest = (inputs: Inputs) => {
    let best = -1;
    let bestD = Infinity;
    pool.forEach((row, i) => {
      if (used.has(i)) return;
      let d = 0;
      for (const v of variables) d += (norm(v, row.inputs[v.name]) - norm(v, inputs[v.name])) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  return {
    id: "dataset",
    name,
    field: "Your data",
    tagline: `${pool.length} rows · ${inputCols.length} inputs → ${outputCol}`,
    description:
      "Uploaded table treated as an oracle pool. The engine chooses which rows to reveal, so it must discover the relationship with as few measurements as possible.",
    question: `What law relates ${inputCols.join(", ")} to ${outputCol}?`,
    variables,
    output: { name: sanitize(outputCol), label: outputCol, unit: "" },
    defaultBudget: Math.min(64, pool.length),
    defaultBatch: Math.max(4, Math.min(8, Math.floor(pool.length / 8))),
    maxExperiments: pool.length,
    noiseNote: "as measured",
    hue: "#f5a524",
    glyph: "▦",
    realize(inputs) {
      const i = nearest(inputs);
      return i >= 0 ? { ...pool[i].inputs } : inputs;
    },
    run(inputs) {
      const i = nearest(inputs);
      if (i < 0) return NaN;
      used.add(i);
      return pool[i].output;
    },
    reset() {
      used.clear();
    },
  };
}

/** Sample dataset: the ideal gas law with 2% sensor noise, generated deterministically. */
export function sampleGasCsv(): string {
  let s = 42;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const lines = ["volume_L,temperature_K,moles,humidity_pct,pressure_kPa"];
  for (let i = 0; i < 160; i++) {
    const V = 1 + rand() * 49;
    const T = 220 + rand() * 180;
    const n = 0.1 + rand() * 4.9;
    const h = rand() * 90;
    const P = (8.314 * n * T) / V;
    const noise = 1 + 0.02 * (rand() + rand() + rand() - 1.5);
    lines.push([V.toFixed(3), T.toFixed(2), n.toFixed(3), h.toFixed(1), (P * noise).toFixed(3)].join(","));
  }
  return lines.join("\n");
}
