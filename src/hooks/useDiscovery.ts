"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startRun, type RunConfig, type RunHandle, type WorkerMessage } from "@/engine/runner";
import type { EngineEvent, EngineSnapshot, EngineStep } from "@/engine/types";

export type PlaybackStatus = "idle" | "running" | "paused" | "finished" | "error";

export interface Keyframe {
  cycle: number;
  label: string;
  snapshot: EngineSnapshot;
}

/** Base delay per event at 1× speed (ms). */
function delayFor(e: EngineEvent): number {
  switch (e.type) {
    case "phase":
      return 650;
    case "note":
      return Math.min(1500, 300 + e.entry.text.length * 5);
    case "hypothesis":
      return 240;
    case "design":
      return 520;
    case "observation":
      return 130;
    case "analysis":
      return 700;
    case "discovery":
      return 2200;
    case "done":
      return 0;
  }
}

export const SPEEDS = [0.5, 1, 2, 4, 16] as const;

export function useDiscovery(options: { autoLoop?: boolean } = {}) {
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [lastEvent, setLastEvent] = useState<EngineEvent | null>(null);
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);

  const queue = useRef<EngineStep[]>([]);
  const ended = useRef(false);
  const handle = useRef<RunHandle | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<PlaybackStatus>("idle");
  const speedRef = useRef(1);
  const configRef = useRef<RunConfig | null>(null);
  const loopRef = useRef(options.autoLoop ?? false);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const setStatusBoth = (s: PlaybackStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const apply = useCallback((step: EngineStep) => {
    setSnapshot(step.snapshot);
    setLastEvent(step.event);
    const e = step.event;
    if (e.type === "analysis" || e.type === "discovery" || e.type === "done") {
      setKeyframes((k) => [
        ...k,
        {
          cycle: step.snapshot.cycle,
          label: e.type === "analysis" ? `Cycle ${step.snapshot.cycle}` : e.type === "discovery" ? "Eureka" : "End",
          snapshot: step.snapshot,
        },
      ]);
    }
  }, []);

  const tick = useCallback(() => {
    clearTimer();
    if (statusRef.current !== "running") return;
    const next = queue.current.shift();
    if (!next) {
      if (ended.current) {
        setStatusBoth("finished");
        setComputing(false);
        if (loopRef.current && configRef.current) {
          timer.current = setTimeout(() => restartRef.current?.(), 6000);
        }
      } else {
        setComputing(true);
        timer.current = setTimeout(tick, 60);
      }
      return;
    }
    setComputing(false);
    apply(next);
    const d = delayFor(next.event) / speedRef.current;
    timer.current = setTimeout(tick, speedRef.current >= 16 ? Math.min(d, 8) : d);
  }, [apply]);

  const start = useCallback(
    (cfg: RunConfig) => {
      handle.current?.cancel();
      clearTimer();
      queue.current = [];
      ended.current = false;
      configRef.current = cfg;
      setKeyframes([]);
      setViewIndex(null);
      setError(null);
      setSnapshot(null);
      setLastEvent(null);
      setStatusBoth("running");
      handle.current = startRun(cfg, (m: WorkerMessage) => {
        if (m.type === "step") queue.current.push(m.step);
        else if (m.type === "end") ended.current = true;
        else if (m.type === "error") {
          ended.current = true;
          setError(m.message);
          setStatusBoth("error");
        }
      });
      timer.current = setTimeout(tick, 50);
    },
    [tick],
  );

  const restartRef = useRef<(() => void) | null>(null);
  restartRef.current = () => {
    if (configRef.current) start({ ...configRef.current, seed: configRef.current.seed + 1 });
  };

  const pause = useCallback(() => {
    if (statusRef.current === "running") {
      clearTimer();
      setStatusBoth("paused");
    }
  }, []);

  const resume = useCallback(() => {
    if (statusRef.current === "paused") {
      setViewIndex(null);
      setStatusBoth("running");
      timer.current = setTimeout(tick, 30);
    }
  }, [tick]);

  /** Advance exactly one event while paused. */
  const stepOnce = useCallback(() => {
    if (statusRef.current !== "paused") return;
    const next = queue.current.shift();
    if (next) {
      setViewIndex(null);
      apply(next);
    } else if (ended.current) setStatusBoth("finished");
  }, [apply]);

  const stop = useCallback(() => {
    handle.current?.cancel();
    clearTimer();
    setStatusBoth("idle");
  }, []);

  useEffect(
    () => () => {
      handle.current?.cancel();
      clearTimer();
    },
    [],
  );

  const viewed = viewIndex !== null ? keyframes[viewIndex]?.snapshot ?? snapshot : snapshot;

  return {
    status,
    snapshot: viewed,
    liveSnapshot: snapshot,
    lastEvent,
    keyframes,
    viewIndex,
    setViewIndex,
    speed,
    setSpeed,
    error,
    computing,
    start,
    pause,
    resume,
    stepOnce,
    stop,
    config: configRef.current,
  };
}
