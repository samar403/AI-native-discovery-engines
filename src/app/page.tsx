import Link from "next/link";
import { HeroLive } from "@/components/site/HeroLive";
import { LABS } from "@/engine/labs";
import { PERSONA } from "@/lib/ui";

const LOOP = [
  {
    n: "01",
    title: "Hypothesize",
    persona: "Theorist" as const,
    body: "Conjectures are written in a symbolic grammar — power laws, saturation, optima, exponentials, sums and products — so every idea is precise enough to be fitted and falsified. A built-in theorist evolves them from marginal scans, ablations and residuals; Claude can take over the job.",
  },
  {
    n: "02",
    title: "Design",
    persona: "Designer" as const,
    body: "The designer looks for the settings where the leading rival theories disagree the most, plus an exploration bonus. Once a law is trusted it spends part of each batch probing the predicted optimum.",
  },
  {
    n: "03",
    title: "Experiment",
    persona: "Robot" as const,
    body: "A simulated lab (or your own data table) returns noisy measurements. The engine never sees the hidden law — only what its experiments reveal.",
  },
  {
    n: "04",
    title: "Analyze",
    persona: "Analyst" as const,
    body: "Every live hypothesis is refit with Levenberg–Marquardt, scored by 5-fold cross-validation, and converted into a posterior probability with the BIC. Ablations and an FDR-controlled residual audit expose what the leader is missing.",
  },
  {
    n: "05",
    title: "Reflect",
    persona: "Critic" as const,
    body: "Losers are falsified with a written verdict. Redundant theories fall to Occam's razor. A law is only declared when it survives replication: ≥90% posterior, out-of-sample R² ≥ 0.95, no residual structure, two cycles in a row.",
  },
];

const RIGOR = [
  ["Falsifiable by construction", "Hypotheses live in a grammar the engine can fit. Vague ideas are rejected by the Critic before they waste an experiment."],
  ["Out-of-sample, always", "Belief is driven by 5-fold cross-validation and BIC, never by in-sample fit alone."],
  ["Occam's razor, quantified", "Extra terms must pay for themselves in BIC; observationally equivalent theories with more parameters are retired."],
  ["Experiments that discriminate", "Box–Hill style model discrimination: measure where rivals disagree, not where it is convenient."],
  ["Ablation & residual audits", "Each variable is removed and re-added to the law; residual trends are tested with Benjamini–Hochberg FDR control."],
  ["Replication before Eureka", "The law must hold for two consecutive cycles of new data before it is announced."],
  ["Reproducible", "Every run is seeded and deterministic — share the seed, replay the science."],
  ["Graded against reality", "Simulated worlds hide a ground truth that is revealed afterwards, so the engine is scored, not just believed."],
];

export default function Home() {
  return (
    <div className="overflow-x-hidden">
      {/* hero */}
      <section className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div className="rise">
          <div className="eyebrow mb-5 flex items-center gap-2">
            <span className="h-px w-8 bg-phosphor" /> AI-native discovery engine
          </div>
          <h1 className="font-display text-[56px] leading-[0.95] sm:text-[84px] lg:text-[100px]">
            Science,
            <br />
            <em className="glow-text text-phosphor">on a loop.</em>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-2">
            Eureka proposes hypotheses, designs the experiments that would tell them apart, runs them, analyses the evidence — and{" "}
            <span className="text-ink">falsifies its way to the law</span>. Right now it is rediscovering Kepler&apos;s third law from scratch, live in your
            browser.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/lab" className="rounded-full bg-phosphor px-6 py-3 font-medium text-black shadow-[0_0_40px_rgba(255,181,71,0.3)] transition hover:brightness-110">
              Open the lab console →
            </Link>
            <Link href="/method" className="rounded-full border border-line-strong px-6 py-3 text-ink-2 transition hover:text-ink">
              How it works
            </Link>
          </div>
          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-6">
            {[
              ["5", "hidden-law worlds + your CSV"],
              ["0", "API keys needed to run"],
              ["100%", "in-browser, seeded, replayable"],
            ].map(([k, v]) => (
              <div key={v}>
                <dt className="font-display text-4xl italic text-ink">{k}</dt>
                <dd className="mt-1 text-xs leading-snug text-ink-3">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <HeroLive />
      </section>

      {/* the loop */}
      <section className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
        <div className="mb-12 max-w-3xl">
          <div className="eyebrow mb-3">the loop</div>
          <h2 className="font-display text-5xl leading-tight sm:text-6xl">
            Five agents, one <em className="text-aqua">scientific method</em>.
          </h2>
          <p className="mt-4 text-ink-3">
            Discovery is a cycle, not a prompt. Each stage is a specialised agent with a narrow, checkable job — and a written record in the lab notebook.
          </p>
        </div>
        <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {LOOP.map((s) => {
            const p = PERSONA[s.persona];
            return (
              <li key={s.n} className="panel group p-5 transition hover:-translate-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-ink-4">{s.n}</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border text-lg" style={{ borderColor: p.color, color: p.color }}>
                    {p.glyph}
                  </span>
                </div>
                <h3 className="font-display mt-6 text-3xl italic">{s.title}</h3>
                <div className="mt-1 text-xs" style={{ color: p.color }}>
                  {s.persona}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-3">{s.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* worlds */}
      <section className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="eyebrow mb-3">worlds with hidden laws</div>
            <h2 className="font-display text-5xl leading-tight sm:text-6xl">Pick a universe. Let it find the physics.</h2>
          </div>
          <p className="max-w-md text-sm text-ink-3 md:ml-auto">
            Each world hides a real law behind noise and red herrings. The engine only sees variable names, ranges and measurements. When it&apos;s done, reveal the
            truth and see how it scored.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LABS.map((l) => (
            <Link key={l.id} href={`/lab?lab=${l.id}&autostart=1`} className="panel group overflow-hidden p-6 transition hover:-translate-y-1">
              <div
                className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-2xl transition group-hover:opacity-40"
                style={{ background: l.hue }}
                aria-hidden="true"
              />
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl" style={{ background: `${l.hue}1c`, color: l.hue }}>
                  {l.glyph}
                </span>
                <div>
                  <div className="eyebrow !text-[10px]">{l.field}</div>
                  <h3 className="text-lg text-ink">{l.name}</h3>
                </div>
              </div>
              <p className="font-display mt-5 text-2xl italic leading-snug text-ink-2">“{l.question}”</p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {l.variables.map((v) => (
                  <span key={v.name} className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-ink-3">
                    {v.label}
                  </span>
                ))}
                <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px]" style={{ color: l.hue }}>
                  → {l.output.label}
                </span>
              </div>
              <div className="mt-6 text-sm text-ink-3 transition group-hover:text-phosphor">Run this discovery →</div>
            </Link>
          ))}
          <Link href="/lab?lab=dataset" className="panel group flex flex-col justify-between border-dashed p-6 transition hover:-translate-y-1">
            <div>
              <div className="eyebrow !text-[10px]">your data</div>
              <h3 className="font-display mt-2 text-3xl italic">Bring a CSV.</h3>
              <p className="mt-3 text-sm text-ink-3">
                Rows become an oracle pool. The engine chooses which measurements to reveal and must find the law with as few as possible — active learning meets symbolic
                regression. Try the bundled gas-cylinder logs: it recovers <span className="font-mono text-ink-2">P ∝ n·T/V</span>.
              </p>
            </div>
            <div className="mt-6 text-sm text-ink-3 transition group-hover:text-phosphor">Upload data →</div>
          </Link>
        </div>
      </section>

      {/* rigor */}
      <section className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
        <div className="panel overflow-hidden p-8 sm:p-12">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <div className="eyebrow mb-3">rigor, not vibes</div>
              <h2 className="font-display text-5xl leading-tight">
                An LLM that guesses is a muse. <em className="text-phosphor">A loop that tests is a scientist.</em>
              </h2>
              <p className="mt-5 text-ink-3">
                Language models are superb at conjecture and terrible at knowing when they&apos;re wrong. Eureka keeps them where they shine — proposing — and puts every
                claim through the same statistical gauntlet.
              </p>
            </div>
            <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {RIGOR.map(([k, v]) => (
                <div key={k} className="border-l border-line pl-4">
                  <dt className="text-sm text-ink">{k}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-ink-3">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* claude */}
      <section className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="eyebrow mb-3">frontier model as theorist</div>
            <h2 className="font-display text-5xl leading-tight">Plug Claude into the loop.</h2>
            <p className="mt-5 text-ink-3">
              Set <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[13px] text-ink">ANTHROPIC_API_KEY</code> and switch the theorist to Claude. Each cycle
              it receives the leaderboard, falsification verdicts, ablations, residual anomalies and a sample of the data, and returns new conjectures as schema-validated
              structured output in the engine&apos;s grammar — so its creativity is immediately testable. If it is unavailable, the built-in theorist takes over
              mid-run; the loop never stalls.
            </p>
            <p className="mt-4 text-ink-3">At the end, Claude can also write the interpretation section of the lab report.</p>
          </div>
          <pre className="panel scroll-thin overflow-x-auto p-6 font-mono text-[12.5px] leading-relaxed text-ink-2">
            {`{
  "notebook_entry": "Residuals of H12 bend with pH —
     the leader ignores an optimum…",
  "hypotheses": [{
    "statement": "Velocity follows Michaelis–Menten
       kinetics in substrate, with Gaussian optima
       in temperature and pH.",
    "combine": "product",
    "terms": [
      { "variable": "S",  "shape": "saturating" },
      { "variable": "Tc", "shape": "peak" },
      { "variable": "pH", "shape": "peak" }
    ],
    "prior": 0.8
  }]
}`}
          </pre>
        </div>
      </section>

      {/* cta */}
      <section className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 text-center sm:px-6">
        <h2 className="font-display text-6xl italic sm:text-7xl">
          Go find a <span className="glow-text text-phosphor">law</span>.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-ink-3">No sign-up, no keys, no install. The whole engine runs in a Web Worker in your browser.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/lab?lab=enzyme&autostart=1" className="rounded-full bg-phosphor px-6 py-3 font-medium text-black hover:brightness-110">
            Start with enzyme kinetics →
          </Link>
          <Link href="/benchmark" className="rounded-full border border-line-strong px-6 py-3 text-ink-2 hover:text-ink">
            See the benchmark
          </Link>
        </div>
      </section>
    </div>
  );
}
