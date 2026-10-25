/**
 * Headless discovery run in the terminal.
 *
 *   npm run discover -- --lab kepler --seed 7 [--budget 48] [--batch 8] [--random] [--quiet]
 */
import { runEngine } from "../src/engine/engine";
import { LABS, getLab } from "../src/engine/labs";
import { scoreAgainstTruth } from "../src/engine/report";
import { buildMarkdownReport } from "../src/engine/report";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);

const lab = getLab(arg("lab") ?? "kepler");
if (!lab) {
  console.error(`Unknown lab. Available: ${LABS.map((l) => l.id).join(", ")}`);
  process.exit(1);
}

const c = {
  dim: "\x1b[2m",
  reset: "\x1b[0m",
  amber: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  bold: "\x1b[1m",
  magenta: "\x1b[35m",
};
const personaColor: Record<string, string> = {
  Theorist: c.magenta,
  Claude: c.magenta,
  Designer: c.cyan,
  Robot: c.dim,
  Analyst: c.amber,
  Critic: c.red,
  System: c.bold,
};

async function main() {
  const t0 = Date.now();
  let last;
  for await (const s of runEngine({
    lab: lab!,
    seed: Number(arg("seed") ?? 7),
    budget: arg("budget") ? Number(arg("budget")) : undefined,
    batch: arg("batch") ? Number(arg("batch")) : undefined,
    designMode: flag("random") ? "random" : "adaptive",
  })) {
    last = s;
    if (flag("quiet")) continue;
    const e = s.event;
    if (e.type === "phase") console.log(`\n${c.bold}── cycle ${e.cycle} · ${e.phase.toUpperCase()} ──${c.reset}`);
    if (e.type === "note") {
      const col = personaColor[e.entry.persona] ?? "";
      console.log(`${col}[${e.entry.persona}]${c.reset} ${e.entry.text}`);
    }
    if (e.type === "hypothesis") console.log(`  ${c.green}+ ${e.hypothesis.id}${c.reset} ${e.hypothesis.label}  ${c.dim}${e.hypothesis.rationale}${c.reset}`);
  }
  const snap = last!.snapshot;
  console.log(`\n${c.bold}${snap.stopReason}${c.reset}  (${((Date.now() - t0) / 1000).toFixed(2)}s)`);
  const score = scoreAgainstTruth(snap, lab!);
  if (score) console.log(`Truth match: ${score.summary}`);
  if (flag("report")) console.log("\n" + buildMarkdownReport(snap, lab!));
}

main();
