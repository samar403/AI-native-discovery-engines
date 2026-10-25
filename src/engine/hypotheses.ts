import { describeForm, formKey, formLabel, validateForm } from "./grammar";
import type { Hypothesis, HypothesisForm, HypothesisOrigin, Lab } from "./types";

export interface HypothesisSeed {
  form: HypothesisForm;
  origin: HypothesisOrigin;
  rationale: string;
  statement?: string;
  parentId?: string;
  prior?: number;
  /** Allow reopening a hypothesis that was pruned or rejected on Occam grounds. */
  revive?: boolean;
}

/** Normalises forms (canonical term order) and stamps ids. */
export class HypothesisFactory {
  private counter = 0;

  constructor(private readonly lab: Lab) {}

  create(seed: HypothesisSeed, cycle: number): Hypothesis | { error: string } {
    const order = this.lab.variables.map((v) => v.name);
    const form: HypothesisForm = {
      combine: seed.form.combine,
      terms: [...seed.form.terms].sort((a, b) => order.indexOf(a.variable) - order.indexOf(b.variable)),
    };
    const err = validateForm(form, this.lab.variables);
    if (err) return { error: err };
    this.counter += 1;
    return {
      id: `H${this.counter}`,
      key: formKey(form),
      label: formLabel(form),
      form,
      statement: seed.statement?.trim() || describeForm(form, this.lab.output, this.lab.variables),
      rationale: seed.rationale,
      origin: seed.origin,
      bornCycle: cycle,
      parentId: seed.parentId,
      prior: Math.min(Math.max(seed.prior ?? 1, 0.05), 1),
      status: "proposed",
      weight: 0,
      history: [],
    };
  }
}
