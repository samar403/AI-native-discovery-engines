/**
 * Benchmark the adaptive loop against random experiment design.
 *
 *   npm run bench -- [--seeds 5] [--labs kepler,enzyme]
 */
import { benchmarkRun, summarize, type BenchRun } from "../src/engine/benchmark";
import { LABS } from "../src/engine/labs";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const seeds = Number(arg("seeds") ?? 5);
const labIds = arg("labs")?.split(",");
const labs = LABS.filter((l) => !labIds || labIds.includes(l.id));

async function main() {
  const runs: BenchRun[] = [];
  for (const lab of labs) {
    for (const mode of ["adaptive", "random"] as const) {
      for (let s = 1; s <= seeds; s++) {
        const r = await benchmarkRun(lab, mode, s);
        runs.push(r);
        process.stdout.write(`${lab.id.padEnd(12)} ${mode.padEnd(9)} seed ${s}: ${r.discovered ? `law @ ${r.experimentsToDiscovery}` : "no law"} · truth ${r.truthScore}\n`);
      }
    }
  }
  console.log("\nlab          mode      discovery  exps→law  truth");
  for (const s of summarize(runs)) {
    console.log(
      `${s.labId.padEnd(12)} ${s.mode.padEnd(9)} ${`${Math.round(s.discoveryRate * 100)}%`.padEnd(10)} ${(s.meanExperimentsToDiscovery?.toFixed(1) ?? "—").padEnd(9)} ${s.meanTruthScore.toFixed(0)}`,
    );
  }
}

main();
