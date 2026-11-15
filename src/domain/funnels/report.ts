import { funnels, stepCode, type Funnel } from './catalogue';

/**
 * UX-ME-1, UX-ME-2: the funnel maths. A fact says a subject reached a step, and when. Reports
 * hold counts, shares and medians only: never a subject's ID, so nothing on Gaff's internal page
 * is about one person or one organisation.
 */
export interface Fact {
  /** The step's full code, such as "sign_in.signed_in". */
  step: string;
  /** The ID of what's counted (an attempt, a letting, an application…). Never shown. */
  subject: string;
  at: Date;
  /** The split's code for this subject, if the step knows it. */
  variant?: string | null;
}

export interface StepReport {
  code: string;
  label: string;
  /** How many subjects reached the step. Each counts once, however often it happened. */
  reached: number;
  /** Reached, as a share of the step before. Null when nothing reached the step before. */
  fromPrevious: number | null;
  /** Reached, as a share of the first step. Null for the first step, or when it's empty. */
  fromFirst: number | null;
  /** The label of the step the time is counted from, where the catalogue defines one. */
  timedFromLabel: string | null;
  /** Median time from that step, in milliseconds, among subjects that reached both. */
  medianMs: number | null;
}

export interface SplitReport {
  label: string;
  /** One row per code seen, then one for subjects whose code isn't known (code null). */
  rows: Array<{ variant: string | null; reached: number[] }>;
}

export interface FunnelReport {
  code: string;
  label: string;
  measure: string;
  target: string;
  steps: StepReport[];
  /** Present when the funnel has a split and at least one subject carries a code. */
  split: SplitReport | null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

type Reached = Map<string, { at: Date; variant: string | null }>;

/** Once per subject: the first time each subject reached each step. */
function firstTimes(facts: readonly Fact[]): Map<string, Reached> {
  const byStep = new Map<string, Reached>();
  for (const fact of facts) {
    const reached = byStep.get(fact.step) ?? new Map();
    byStep.set(fact.step, reached);
    const seen = reached.get(fact.subject);
    if (!seen) {
      reached.set(fact.subject, { at: fact.at, variant: fact.variant ?? null });
    } else if (fact.at.getTime() < seen.at.getTime()) {
      reached.set(fact.subject, { at: fact.at, variant: fact.variant ?? seen.variant });
    } else if (seen.variant === null && fact.variant) {
      seen.variant = fact.variant;
    }
  }
  return byStep;
}

const share = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

export function funnelReport(funnel: Funnel, facts: readonly Fact[]): FunnelReport {
  const codes = new Set(funnel.steps.map((step) => stepCode(funnel, step)));
  const byStep = firstTimes(facts.filter((fact) => codes.has(fact.step)));
  const reachedAt = (code: string): Reached => byStep.get(stepCode(funnel, { code })) ?? new Map();

  const steps = funnel.steps.map((step, index): StepReport => {
    const reached = reachedAt(step.code);
    const previous = index > 0 ? reachedAt(funnel.steps[index - 1]!.code) : null;
    const first = index > 0 ? reachedAt(funnel.steps[0]!.code) : null;
    const from = step.timedFrom ? funnel.steps.find((s) => s.code === step.timedFrom) : undefined;
    const times: number[] = [];
    if (from) {
      const earlier = reachedAt(from.code);
      for (const [subject, { at }] of reached) {
        const start = earlier.get(subject);
        // A step recorded before the one it's timed from isn't a time between them.
        if (start && at.getTime() >= start.at.getTime()) {
          times.push(at.getTime() - start.at.getTime());
        }
      }
    }
    return {
      code: step.code,
      label: step.label,
      reached: reached.size,
      fromPrevious: previous ? share(reached.size, previous.size) : null,
      fromFirst: first ? share(reached.size, first.size) : null,
      timedFromLabel: from?.label ?? null,
      medianMs: median(times),
    };
  });

  return {
    code: funnel.code,
    label: funnel.label,
    measure: funnel.measure,
    target: funnel.target,
    steps,
    split: funnel.split ? splitReport(funnel, funnel.split, reachedAt) : null,
  };
}

function splitReport(
  funnel: Funnel,
  label: string,
  reachedAt: (code: string) => Reached,
): SplitReport | null {
  // A subject's code is the first one any of its steps carries, in step order: the method isn't
  // known when the sign-in screen opens, only once it's chosen.
  const variantOf = new Map<string, string>();
  for (const step of funnel.steps) {
    for (const [subject, { variant }] of reachedAt(step.code)) {
      if (variant && !variantOf.has(subject)) variantOf.set(subject, variant);
    }
  }
  if (variantOf.size === 0) return null;
  const variants = [...new Set(variantOf.values())].sort();
  const count = (variant: string | null) =>
    funnel.steps.map(
      (step) =>
        [...reachedAt(step.code).keys()].filter(
          (subject) => (variantOf.get(subject) ?? null) === variant,
        ).length,
    );
  const rows = variants.map((variant) => ({
    variant: variant as string | null,
    reached: count(variant),
  }));
  const unknown = count(null);
  if (unknown.some((n) => n > 0)) rows.push({ variant: null, reached: unknown });
  return { label, rows };
}

/** Every funnel in the catalogue, in its order; one with no facts still lists its steps. */
export function allFunnelReports(facts: readonly Fact[]): FunnelReport[] {
  const catalogue: readonly Funnel[] = funnels;
  return catalogue.map((funnel) => funnelReport(funnel, facts));
}

/** "75%". Shares are of counts, so a whole number is precise enough. */
export function formatShare(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** A median time in plain words: "45 seconds", "3 minutes", "5 hours", "2 days". */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return plural(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return plural(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 48) return plural(hours, 'hour');
  return plural(Math.round(hours / 24), 'day');
}

/** A split's code in plain words: "email_link" reads "Email link". */
export function variantLabel(variant: string | null): string {
  if (variant === null) return 'Not known';
  const words = variant.replace(/[_.:-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
