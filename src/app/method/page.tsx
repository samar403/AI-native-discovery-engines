import type { Metadata } from "next";
import Link from "next/link";
import { DISCOVERY_CRITERIA } from "@/engine/engine";

export const metadata: Metadata = {
  title: "Method — Eureka",
  description: "How the Eureka discovery loop works: grammar, fitting, Bayesian model selection, experiment design and falsification.",
};

const GRAMMAR = [
  ["linear", "b·x", "proportional effects"],
  ["quadratic", "b₁x + b₂x²", "curvature"],
  ["log", "b·ln x", "diminishing returns"],
  ["power", "b·xᵖ", "scaling laws (Kepler, elasticity)"],
  ["exp", "b·eᵏˣ", "growth / decay, Arrhenius-like"],
  ["saturating", "b·xⁿ/(Kⁿ+xⁿ)", "Michaelis–Menten, Hill"],
  ["peak", "b·exp(−½((x−μ)/s)²)", "optima (temperature, pH, concentration)"],
];

function Architecture() {
  const box = (x: number, y: number, w: number, h: number, title: string, sub: string, color: string) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="12" fill="var(--surface-2)" stroke={color} strokeOpacity="0.6" />
      <text x={x + 14} y={y + 24} fontSize="13" fill="var(--ink)">
        {title}
      </text>
      <text x={x + 14} y={y + 42} fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--font-geist-mono)">
        {sub}
      </text>
    </g>
  );
  const arrow = (d: string) => <path d={d} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" markerEnd="url(#arr)" />;
  return (
    <svg viewBox="0 0 900 360" className="w-full" role="img" aria-label="System architecture">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-3)" />
        </marker>
      </defs>
      <text x="20" y="24" className="eyebrow" fontSize="11" fill="var(--ink-4)" letterSpacing="2">
        BROWSER
      </text>
      <rect x="10" y="34" width="600" height="316" rx="16" fill="none" stroke="var(--line)" strokeDasharray="4 4" />
      {box(30, 50, 250, 60, "React UI (Next.js App Router)", "reactor · evidence · ledger · notebook", "var(--phosphor)")}
      {box(30, 140, 250, 60, "Playback controller", "useDiscovery: pace, pause, step, rewind", "var(--phosphor)")}
      {box(330, 50, 260, 280, "Web Worker: discovery engine", "", "var(--aqua)")}
      {box(345, 85, 230, 46, "Theorist", "heuristic | Claude (remote)", "var(--orchid)")}
      {box(345, 140, 230, 46, "Designer", "LHS · Box–Hill · optimise", "var(--aqua)")}
      {box(345, 195, 230, 46, "Lab / dataset oracle", "hidden law + noise · CSV pool", "var(--ink-3)")}
      {box(345, 250, 230, 60, "Analyst + Critic", "LM fits · 5-fold CV · BIC posterior · ablation · BH-FDR", "var(--phosphor)")}
      {arrow("M330,170 L282,170")}
      {arrow("M155,140 L155,112")}
      <text x="292" y="162" fontSize="10" fill="var(--ink-4)">
        steps
      </text>
      <text x="640" y="24" fontSize="11" fill="var(--ink-4)" letterSpacing="2">
        SERVER
      </text>
      <rect x="630" y="34" width="260" height="316" rx="16" fill="none" stroke="var(--line)" strokeDasharray="4 4" />
      {box(650, 85, 220, 60, "/api/agent (Node)", "propose · report", "var(--orchid)")}
      {box(650, 190, 220, 60, "Claude API", "structured outputs · fallbacks", "#e8a07a")}
      {arrow("M575,108 L648,112")}
      {arrow("M760,145 L760,188")}
      <text x="588" y="100" fontSize="10" fill="var(--ink-4)">
        context JSON
      </text>
      <text x="660" y="290" fontSize="10.5" fill="var(--ink-3)">
        API key stays server-side.
      </text>
      <text x="660" y="306" fontSize="10.5" fill="var(--ink-3)">
        Optional — the engine runs fully
      </text>
      <text x="660" y="322" fontSize="10.5" fill="var(--ink-3)">
        without it.
      </text>
    </svg>
  );
}

export default function MethodPage() {
  const c = DISCOVERY_CRITERIA;
  return (
    <article className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
      <div className="eyebrow">method</div>
      <h1 className="font-display mt-2 text-5xl italic sm:text-7xl">How the loop thinks.</h1>
      <p className="mt-5 text-lg leading-relaxed text-ink-2">
        AI-native discovery engines are automated loops that propose hypotheses, run experiments and analyse the results — the idea Y Combinator highlighted in its
        Requests for Startups. Eureka is a complete, working instance of that loop, small enough to read and rigorous enough to trust.
      </p>

      <section className="mt-14">
        <h2 className="font-display text-4xl">Why now</h2>
        <div className="mt-4 grid gap-4 text-ink-3 sm:grid-cols-3">
          <p>
            <span className="text-ink">Models can conjecture.</span> Frontier LLMs carry enough domain knowledge to propose plausible mechanisms in physics, chemistry,
            biology and economics.
          </p>
          <p>
            <span className="text-ink">Labs can be driven by software.</span> Self-driving labs, cloud labs, simulators and A/B platforms expose experiments as API
            calls.
          </p>
          <p>
            <span className="text-ink">The bottleneck is the loop.</span> Value comes from closing it — choosing the next experiment and knowing when a result is real —
            not from any single model call.
          </p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-4xl">Architecture</h2>
        <div className="panel mt-5 p-4 sm:p-6">
          <Architecture />
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-4xl">1 · A grammar for falsifiable ideas</h2>
        <p className="mt-3 text-ink-3">
          A hypothesis is either an additive model <code className="font-mono text-ink">y = b₀ + Σ gₖ(xₖ)</code> or a multiplicative one{" "}
          <code className="font-mono text-ink">y = A · Π hₖ(xₖ)</code>, built from these shapes. Anything expressible here can be fitted, cross-validated and
          compared — that is what makes a conjecture scientific rather than rhetorical.
        </p>
        <div className="panel mt-5 overflow-x-auto p-2">
          <table className="w-full min-w-[520px] text-left text-sm">
            <tbody>
              {GRAMMAR.map(([k, f, use]) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-mono text-aqua">{k}</td>
                  <td className="px-4 font-mono text-ink">{f}</td>
                  <td className="px-4 text-ink-3">{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 space-y-4 text-ink-3">
        <h2 className="font-display text-4xl text-ink">2 · Fitting and belief</h2>
        <p>
          Each live hypothesis is fitted by <span className="text-ink">Levenberg–Marquardt</span> nonlinear least squares, initialised by a grid-plus-OLS backfitting
          search (and warm-started from its previous fit), with random restarts. When the response spans more than ~1.7 orders of magnitude the Analyst switches to
          log-residuals — the multiplicative-noise model.
        </p>
        <p>
          Belief is the BIC approximation to the posterior model probability, <code className="font-mono text-ink">p(H|D) ∝ prior · e^(−BIC/2)</code>, normalised over
          the survivors. Predictive power is reported as <span className="text-ink">5-fold cross-validated R²</span>, so a model can&apos;t win by memorising noise.
        </p>
      </section>

      <section className="mt-14 space-y-4 text-ink-3">
        <h2 className="font-display text-4xl text-ink">3 · Choosing the next experiment</h2>
        <p>
          The first batch is a Latin-hypercube screening sweep. After that, the Designer draws 320 candidate settings and scores each by the posterior-weighted
          disagreement between the top rival hypotheses (Box–Hill model discrimination), plus an exploration bonus for distance from past measurements. A greedy pick
          with a repulsion radius keeps the batch diverse. Once a law is trusted in an optimisation world, half of each batch probes the predicted optimum.
        </p>
      </section>

      <section className="mt-14 space-y-4 text-ink-3">
        <h2 className="font-display text-4xl text-ink">4 · Falsification and Occam</h2>
        <ul className="list-inside list-disc space-y-2">
          <li>
            <span className="text-ink">Falsified</span> — posterior below 1:1000 against the leader and worse out-of-sample, after at least one cycle of targeted data.
          </li>
          <li>
            <span className="text-ink">Occam (nesting)</span> — strictly extends the leader but the extra terms cost more BIC than they buy.
          </li>
          <li>
            <span className="text-ink">Occam (equivalence)</span> — predictions within 0.25σ of the leader on every measurement, with more parameters.
          </li>
          <li>
            <span className="text-ink">Pruned</span> — the population is capped; the weakest are retired (and can be reopened if new evidence calls for them).
          </li>
        </ul>
        <p>
          The Analyst also runs <span className="text-ink">ablations</span> (remove each variable from the leader; try adding each missing one) and a{" "}
          <span className="text-ink">residual audit</span>: residuals are correlated with every variable&apos;s trend and curvature, with Benjamini–Hochberg FDR
          control. Anomalies feed straight back to the Theorist as repair targets.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-4xl">5 · When is it a discovery?</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            [`posterior ≥ ${c.minPosterior * 100}%`, "including observationally-equivalent forms, which are reported alongside"],
            [`out-of-sample R² ≥ ${c.minCvR2}`, "5-fold cross-validation on all data"],
            ["no residual structure", "BH-corrected residual audit is clean"],
            ["every term essential", "removing any variable costs ΔBIC > 10; no missing variable would gain > 10"],
            [`≥ ${c.minObservations} and ≥ 3×parameters observations`, "enough data to trust the fit"],
            [`stable for ${c.stableCycles} cycles`, "replicated on fresh, adversarially chosen experiments"],
          ].map(([k, v]) => (
            <div key={k} className="panel p-4">
              <div className="font-mono text-sm text-phosphor">{k}</div>
              <div className="mt-1 text-sm text-ink-3">{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 space-y-3 text-ink-3">
        <h2 className="font-display text-4xl text-ink">Roadmap</h2>
        <p>Where this goes as a company: the same loop, pointed at real instruments.</p>
        <ul className="list-inside list-disc space-y-1.5">
          <li>Lab adapters: cloud-lab protocols, robotic liquid handlers, simulation backends (DFT, MD, CFD), experimentation platforms.</li>
          <li>Richer hypothesis spaces: interactions, ODE models, causal graphs, and code-as-hypothesis with sandboxed execution.</li>
          <li>Cost-aware design: expected information gain per dollar, batch constraints, multi-fidelity experiments.</li>
          <li>Shared, auditable notebooks: every claim linked to the experiments that support or falsify it.</li>
        </ul>
      </section>

      <div className="mt-16 flex gap-3">
        <Link href="/lab" className="rounded-full bg-phosphor px-6 py-3 font-medium text-black hover:brightness-110">
          Open the lab console →
        </Link>
        <Link href="/benchmark" className="rounded-full border border-line-strong px-6 py-3 text-ink-2 hover:text-ink">
          Benchmark
        </Link>
      </div>
    </article>
  );
}
