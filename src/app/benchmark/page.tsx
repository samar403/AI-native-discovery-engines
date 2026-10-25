import type { Metadata } from "next";
import { BenchmarkClient } from "./BenchmarkClient";

export const metadata: Metadata = {
  title: "Benchmark — Eureka",
  description: "Adaptive discovery loop vs random experiment design across five hidden-law worlds.",
};

export default function BenchmarkPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-20 pt-10 sm:px-6">
      <div className="eyebrow">benchmark</div>
      <h1 className="font-display mt-2 text-5xl italic sm:text-6xl">Does choosing experiments matter?</h1>
      <p className="mt-4 max-w-3xl text-ink-3">
        Same theorist, same statistics, same budget — the only difference is <em>which</em> experiments get run. The adaptive loop measures where rival theories
        disagree; the baseline samples uniformly at random. Every run is scored against the world&apos;s hidden ground truth. Run it yourself: it is all computed in
        your browser.
      </p>
      <div className="mt-8">
        <BenchmarkClient />
      </div>
    </div>
  );
}
