/**
 * Runs the engine off the main thread (Web Worker) when possible, otherwise inline.
 * The UI receives every step and paces playback itself.
 */
import { runConfigured, type RunConfig } from "./configured";
import type { EngineStep } from "./types";

export type { DatasetConfig, RunConfig } from "./configured";

export interface RunHandle {
  cancel(): void;
}

export type WorkerMessage =
  | { type: "step"; step: EngineStep }
  | { type: "end" }
  | { type: "error"; message: string };

export function startRun(cfg: RunConfig, onMessage: (m: WorkerMessage) => void): RunHandle {
  if (typeof Worker !== "undefined") {
    try {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (e: MessageEvent<WorkerMessage>) => onMessage(e.data);
      worker.onerror = (e) => onMessage({ type: "error", message: e.message || "Worker crashed." });
      worker.postMessage({ type: "start", config: cfg });
      return { cancel: () => worker.terminate() };
    } catch {
      // fall through to inline execution
    }
  }
  let cancelled = false;
  (async () => {
    try {
      for await (const step of runConfigured(cfg)) {
        if (cancelled) return;
        onMessage({ type: "step", step });
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!cancelled) onMessage({ type: "end" });
    } catch (err) {
      if (!cancelled) onMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  })();
  return { cancel: () => (cancelled = true) };
}
