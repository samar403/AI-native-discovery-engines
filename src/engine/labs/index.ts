/**
 * Simulated worlds with hidden laws. The engine sees only variable names, ranges and
 * noisy measurements — the `truth` is revealed after the run to score the discovery.
 */
import type { Lab } from "../types";

const noisy = (v: number, rel: number, rng: { normal(): number }) => v * (1 + rel * rng.normal());

export const pendulum: Lab = {
  id: "pendulum",
  name: "Pendulum Bench",
  field: "Classical mechanics",
  tagline: "Rediscover Galileo — does mass matter?",
  description:
    "A motorised pendulum rig. The engine controls string length, bob mass and release angle, and measures the period with a photogate.",
  question: "What determines the period of a pendulum?",
  variables: [
    { name: "L", label: "length", unit: "m", min: 0.1, max: 3, scale: "log" },
    { name: "m", label: "bob mass", unit: "kg", min: 0.05, max: 2 },
    { name: "theta", label: "release angle", unit: "°", min: 2, max: 15 },
  ],
  output: { name: "T", label: "period", unit: "s" },
  defaultBudget: 64,
  defaultBatch: 8,
  noiseNote: "0.5% timing jitter",
  hue: "#4fe3c1",
  glyph: "◷",
  run({ L, theta }, rng) {
    const th = (theta * Math.PI) / 180;
    return noisy(2 * Math.PI * Math.sqrt(L / 9.81) * (1 + (th * th) / 16), 0.005, rng);
  },
  truth: {
    equation: "T = 2π·√(L/g)·(1 + θ²/16) ≈ 2.006·L^0.5",
    summary:
      "Period scales with the square root of length. Mass has no effect at all; the release angle adds only a tiny (<0.5%) finite-amplitude correction — the small-angle approximation holds.",
    form: { combine: "product", terms: [{ variable: "L", shape: "power" }] },
    reference: { "L.p": 0.5 },
    optional: ["theta"],
  },
};

export const kepler: Lab = {
  id: "kepler",
  name: "Exoplanet Survey",
  field: "Astronomy",
  tagline: "Kepler's third law, from scratch",
  description:
    "A synthetic transit survey. Each experiment points the telescope at a system with a chosen orbital radius, host-star mass and planet mass, and measures the orbital period.",
  question: "How does a planet's orbital period depend on its orbit and its star?",
  variables: [
    { name: "a", label: "semi-major axis", unit: "AU", min: 0.2, max: 40, scale: "log" },
    { name: "M", label: "stellar mass", unit: "M☉", min: 0.3, max: 3, scale: "log" },
    { name: "mp", label: "planet mass", unit: "M⊕", min: 0.1, max: 300, scale: "log" },
  ],
  output: { name: "P", label: "orbital period", unit: "yr" },
  defaultBudget: 64,
  defaultBatch: 8,
  noiseNote: "1% period uncertainty",
  hue: "#ffb547",
  glyph: "✶",
  run({ a, M }, rng) {
    return noisy(Math.pow(a, 1.5) / Math.sqrt(M), 0.01, rng);
  },
  truth: {
    equation: "P = a^1.5 · M^−0.5",
    summary:
      "Period grows as the 3/2 power of the orbital radius and falls as the inverse square root of stellar mass. Planet mass is irrelevant (it is negligible next to the star).",
    form: {
      combine: "product",
      terms: [
        { variable: "a", shape: "power" },
        { variable: "M", shape: "power" },
      ],
    },
    reference: { "a.p": 1.5, "M.p": -0.5 },
  },
};

export const enzyme: Lab = {
  id: "enzyme",
  name: "Enzyme Kinetics",
  field: "Biochemistry",
  tagline: "Saturation, temperature optimum, pH optimum",
  description:
    "A robotic plate reader assays a novel hydrolase. The engine sets substrate concentration, temperature and buffer pH, then reads the initial reaction velocity.",
  question: "How does reaction velocity depend on substrate, temperature and pH — and where is the optimum?",
  variables: [
    { name: "S", label: "substrate", unit: "mM", min: 0.2, max: 40, scale: "log" },
    { name: "Tc", label: "temperature", unit: "°C", min: 10, max: 65 },
    { name: "pH", label: "pH", unit: "", min: 4, max: 10 },
  ],
  output: { name: "v", label: "velocity", unit: "µmol/min" },
  objective: "maximize",
  defaultBudget: 120,
  defaultBatch: 12,
  noiseNote: "±1.5 µmol/min + 2% read noise",
  hue: "#ff7ab6",
  glyph: "⌬",
  run({ S, Tc, pH }, rng) {
    const v =
      ((120 * S) / (4.5 + S)) * Math.exp(-0.5 * ((Tc - 37) / 8) ** 2) * Math.exp(-0.5 * ((pH - 7.4) / 1.1) ** 2);
    return Math.max(0, v * (1 + 0.02 * rng.normal()) + 1.5 * rng.normal());
  },
  truth: {
    equation: "v = 120 · S/(4.5 + S) · ∩(T; 37 °C, 8) · ∩(pH; 7.4, 1.1)",
    summary:
      "Michaelis–Menten saturation in substrate (Km ≈ 4.5 mM), a Gaussian temperature optimum at 37 °C and a pH optimum at 7.4. Peak velocity ≈ 108 µmol/min at saturating substrate.",
    form: {
      combine: "product",
      terms: [
        { variable: "S", shape: "saturating" },
        { variable: "Tc", shape: "peak" },
        { variable: "pH", shape: "peak" },
      ],
    },
    reference: { "S.K": 4.5, "Tc.mu": 37, "pH.mu": 7.4 },
  },
};

export const demand: Lab = {
  id: "demand",
  name: "Pricing Experiments",
  field: "Economics / growth",
  tagline: "Price elasticity hidden in A/B noise",
  description:
    "A storefront runs randomised cohorts. Each experiment sets price, ad spend and the number of onboarding steps, and observes weekly units sold.",
  question: "What drives demand, and how elastic is it to price?",
  variables: [
    { name: "price", label: "price", unit: "$", min: 5, max: 80, scale: "log" },
    { name: "ads", label: "ad spend", unit: "k$/wk", min: 1, max: 100, scale: "log" },
    { name: "steps", label: "onboarding steps", unit: "", min: 1, max: 12 },
  ],
  output: { name: "Q", label: "units sold", unit: "/wk" },
  defaultBudget: 72,
  defaultBatch: 8,
  noiseNote: "4% cohort noise",
  hue: "#8ea8ff",
  glyph: "◈",
  run({ price, ads, steps }, rng) {
    return noisy(60000 * Math.pow(price, -1.6) * Math.pow(ads, 0.3) * Math.exp(-0.06 * steps), 0.04, rng);
  },
  truth: {
    equation: "Q = 60000 · price^−1.6 · ads^0.3 · e^(−0.06·steps)",
    summary:
      "Demand is elastic (elasticity −1.6), ad spend has diminishing returns (exponent 0.3) and every extra onboarding step costs ~6% of conversions.",
    form: {
      combine: "product",
      terms: [
        { variable: "price", shape: "power" },
        { variable: "ads", shape: "power" },
        { variable: "steps", shape: "exp" },
      ],
    },
    reference: { "price.p": -1.6, "ads.p": 0.3, "steps.k": -0.06 },
  },
};

export const electrolyte: Lab = {
  id: "electrolyte",
  name: "Electrolyte Screening",
  field: "Materials science",
  tagline: "Find the conductivity sweet spot",
  description:
    "A self-driving battery lab mixes electrolytes and measures ionic conductivity. Controls: salt concentration, cell temperature and a proprietary additive fraction.",
  question: "Which formulation maximises ionic conductivity, and does the additive help?",
  variables: [
    { name: "c", label: "salt concentration", unit: "M", min: 0.1, max: 4 },
    { name: "Tk", label: "temperature", unit: "°C", min: -20, max: 60 },
    { name: "add", label: "additive", unit: "%", min: 0, max: 10 },
  ],
  output: { name: "σ", label: "conductivity", unit: "mS/cm" },
  objective: "maximize",
  defaultBudget: 72,
  defaultBatch: 8,
  noiseNote: "3% impedance noise",
  hue: "#c3f53b",
  glyph: "⚡",
  run({ c, Tk }, rng) {
    return noisy(9 * Math.exp(-0.5 * ((c - 1.2) / 0.55) ** 2) * Math.exp(0.018 * Tk), 0.03, rng);
  },
  truth: {
    equation: "σ = 9 · ∩(c; 1.2 M, 0.55) · e^(0.018·T)",
    summary:
      "Conductivity peaks at ≈1.2 M salt (ion pairing beyond that) and rises Arrhenius-like with temperature. The additive does nothing — a red herring.",
    form: {
      combine: "product",
      terms: [
        { variable: "c", shape: "peak" },
        { variable: "Tk", shape: "exp" },
      ],
    },
    reference: { "c.mu": 1.2, "Tk.k": 0.018 },
  },
};

export const LABS: Lab[] = [kepler, pendulum, enzyme, demand, electrolyte];

export function getLab(id: string): Lab | undefined {
  return LABS.find((l) => l.id === id);
}
