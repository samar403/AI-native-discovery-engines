/// <reference lib="webworker" />
import { benchmarkRun } from "./benchmark";
import { getLab } from "./labs";
import { runConfigured, type RunConfig } from "./configured";

type Incoming =
  | { type: "start"; config: RunConfig }
  | { type: "bench"; jobs: { labId: string; mode: "adaptive" | "random"; seed: number }[] };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<Incoming>) => {
  const msg = e.data;
  try {
    if (msg.type === "start") {
      for await (const step of runConfigured(msg.config)) ctx.postMessage({ type: "step", step });
      ctx.postMessage({ type: "end" });
    } else if (msg.type === "bench") {
      for (const job of msg.jobs) {
        const lab = getLab(job.labId);
        if (!lab) continue;
        const run = await benchmarkRun(lab, job.mode, job.seed);
        ctx.postMessage({ type: "bench-result", run });
      }
      ctx.postMessage({ type: "end" });
    }
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
