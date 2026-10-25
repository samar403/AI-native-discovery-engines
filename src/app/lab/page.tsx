import type { Metadata } from "next";
import { Suspense } from "react";
import { LabConsole } from "./LabConsole";

export const metadata: Metadata = {
  title: "Lab console — Eureka",
  description: "Run an autonomous discovery loop: hypotheses, experiments, analysis, falsification.",
};

export default function LabPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-ink-4">Booting the lab…</div>}>
      <LabConsole />
    </Suspense>
  );
}
