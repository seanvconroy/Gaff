import { describe, expect, it } from 'vitest';
import { funnels, type Funnel } from './catalogue';
import {
  allFunnelReports,
  formatDuration,
  formatShare,
  funnelReport,
  median,
  variantLabel,
  type Fact,
} from './report';

const catalogue: readonly Funnel[] = funnels;
const signIn = catalogue.find((funnel) => funnel.code === 'sign_in')!;
const addLetting = catalogue.find((funnel) => funnel.code === 'add_letting')!;

const at = (seconds: number) => new Date(Date.UTC(2026, 10, 5, 12, 0, seconds));
const fact = (step: string, subject: string, seconds: number, variant?: string): Fact => ({
  step,
  subject,
  at: at(seconds),
  variant,
});

describe('UX-ME-2: funnel maths, from counts only', () => {
  it('UX-ME-2: counts who reached each step, and the share of the step before and of the first', () => {
    const report = funnelReport(signIn, [
      fact('sign_in.screen_opened', 'a', 0),
      fact('sign_in.screen_opened', 'b', 0),
      fact('sign_in.screen_opened', 'c', 0),
      fact('sign_in.screen_opened', 'd', 0),
      fact('sign_in.method_chosen', 'a', 10),
      fact('sign_in.method_chosen', 'b', 20),
      fact('sign_in.signed_in', 'a', 30),
    ]);
    expect(report.steps.map((step) => step.reached)).toEqual([4, 2, 1]);
    expect(report.steps.map((step) => step.fromPrevious)).toEqual([null, 0.5, 0.5]);
    expect(report.steps.map((step) => step.fromFirst)).toEqual([null, 0.5, 0.25]);
  });

  it('UX-ME-1: counts a step once per subject, however often it was recorded', () => {
    const report = funnelReport(signIn, [
      fact('sign_in.screen_opened', 'a', 0),
      fact('sign_in.screen_opened', 'a', 5),
      fact('sign_in.screen_opened', 'a', 9),
      fact('sign_in.method_chosen', 'a', 20),
      fact('sign_in.method_chosen', 'a', 12),
    ]);
    expect(report.steps.map((step) => step.reached)).toEqual([1, 1, 0]);
    // The first time counts: 12 seconds after the screen first opened.
    expect(report.steps[1]!.medianMs).toBe(12_000);
  });

  it('UX-ME-2: gives the median time between two steps, for subjects that reached both', () => {
    const report = funnelReport(signIn, [
      fact('sign_in.screen_opened', 'a', 0),
      fact('sign_in.screen_opened', 'b', 0),
      fact('sign_in.screen_opened', 'c', 0),
      fact('sign_in.screen_opened', 'd', 0),
      fact('sign_in.method_chosen', 'a', 10),
      fact('sign_in.method_chosen', 'b', 20),
      fact('sign_in.method_chosen', 'c', 60),
      // No screen-opened step for this one, so there's no time to count.
      fact('sign_in.method_chosen', 'z', 1),
    ]);
    expect(report.steps[1]).toMatchObject({
      reached: 4,
      timedFromLabel: 'Screen opened',
      medianMs: 20_000,
    });
    expect(report.steps[0]).toMatchObject({ timedFromLabel: null, medianMs: null });
    expect(report.steps[2]).toMatchObject({ reached: 0, medianMs: null });
  });

  it('UX-ME-2: leaves out a time that would run backwards', () => {
    const report = funnelReport(signIn, [
      fact('sign_in.screen_opened', 'a', 50),
      fact('sign_in.method_chosen', 'a', 10),
    ]);
    expect(report.steps[1]!.medianMs).toBeNull();
  });

  it('UX-ME-2: the median of an even number of times is the middle two, averaged', () => {
    expect(median([])).toBeNull();
    expect(median([7])).toBe(7);
    expect(median([30, 10, 20])).toBe(20);
    expect(median([40, 10, 20, 30])).toBe(25);
  });

  it('UX-ME-2: a funnel with no data still lists its steps, with nothing to show', () => {
    const report = funnelReport(signIn, []);
    expect(report.steps.map((step) => step.label)).toEqual([
      'Screen opened',
      'Method chosen',
      'Signed in',
    ]);
    for (const step of report.steps) {
      expect(step).toMatchObject({
        reached: 0,
        fromPrevious: null,
        fromFirst: null,
        medianMs: null,
      });
    }
    expect(report.split).toBeNull();
  });

  it('UX-ME-2: a step with nothing before it has no share, but keeps its share of the first step', () => {
    // Today "draft reviewed" isn't a separate step, so nothing reaches it.
    const report = funnelReport(addLetting, [
      fact('add_letting.started', 'x', 0),
      fact('add_letting.started', 'y', 0),
      fact('add_letting.live', 'x', 240),
    ]);
    expect(report.steps[1]).toMatchObject({ reached: 0, fromPrevious: 0, fromFirst: 0 });
    expect(report.steps[2]).toMatchObject({
      reached: 1,
      fromPrevious: null,
      fromFirst: 0.5,
      timedFromLabel: 'Started',
      medianMs: 240_000,
    });
  });

  it('UX-ME-2: splits a funnel by its code, such as the sign-in method', () => {
    const report = funnelReport(signIn, [
      fact('sign_in.screen_opened', 'a', 0),
      fact('sign_in.screen_opened', 'b', 0),
      fact('sign_in.screen_opened', 'c', 0),
      fact('sign_in.method_chosen', 'a', 10, 'email_code'),
      fact('sign_in.method_chosen', 'b', 10, 'passkey'),
      fact('sign_in.signed_in', 'a', 30, 'email_code'),
    ]);
    expect(report.split).toEqual({
      label: 'Method',
      rows: [
        { variant: 'email_code', reached: [1, 1, 1] },
        { variant: 'passkey', reached: [1, 1, 0] },
        // Opened the screen and chose nothing.
        { variant: null, reached: [1, 0, 0] },
      ],
    });
  });

  it('UX-ME-2: ignores facts for other funnels, and reports hold no subject IDs', () => {
    const subject = '0b0f7c3e-2a31-4d3c-9a43-0f0d2b8a6c11';
    const report = funnelReport(signIn, [
      fact('sign_in.screen_opened', subject, 0),
      fact('first_run.signed_in', subject, 0),
    ]);
    expect(report.steps.map((step) => step.reached)).toEqual([1, 0, 0]);
    expect(JSON.stringify(report)).not.toContain(subject);
  });

  it('UX-ME-2: reports every funnel in the catalogue, in order', () => {
    const reports = allFunnelReports([fact('renter_booking.opened', 'a', 0)]);
    expect(reports.map((report) => report.code)).toEqual(catalogue.map((funnel) => funnel.code));
    expect(reports.find((r) => r.code === 'renter_booking')!.steps[1]!.reached).toBe(1);
  });

  it('UX-ME-2: writes shares and times in plain words', () => {
    expect(formatShare(0.5)).toBe('50%');
    expect(formatShare(2 / 3)).toBe('67%');
    expect(formatShare(1)).toBe('100%');
    expect(formatDuration(0)).toBe('0 seconds');
    expect(formatDuration(1_000)).toBe('1 second');
    expect(formatDuration(45_000)).toBe('45 seconds');
    expect(formatDuration(3 * 60_000)).toBe('3 minutes');
    expect(formatDuration(5 * 3_600_000)).toBe('5 hours');
    expect(formatDuration(3 * 86_400_000)).toBe('3 days');
    expect(variantLabel('email_code')).toBe('Email code');
    expect(variantLabel(null)).toBe('Not known');
  });
});
