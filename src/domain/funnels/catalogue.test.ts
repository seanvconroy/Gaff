import { describe, expect, it } from 'vitest';
import { isSafeEventValue } from '@/domain/record/personal-data';
import {
  directStepCodes,
  funnelOfDirectStep,
  funnels,
  isDirectStep,
  recordSources,
  stepCode,
  subjectKinds,
  type Funnel,
} from './catalogue';

const catalogue: readonly Funnel[] = funnels;
const byCode = (code: string) => catalogue.find((funnel) => funnel.code === code)!;
const steps = (code: string) => byCode(code).steps.map((step) => step.code);

describe('UX-ME-1: the funnel catalogue', () => {
  it('UX-ME-1: has every funnel in section 9’s table, in its order', () => {
    expect(catalogue.map((funnel) => funnel.code).slice(0, 23)).toEqual([
      'sign_in',
      'first_run',
      'add_letting',
      'import',
      'forwarding',
      'activation',
      'on_gaff',
      'invite_team',
      'home',
      'first_decision',
      'offer',
      'search',
      'ask_to_view',
      'saved_search',
      'profile',
      'enquiry_sources',
      'renter_questions',
      'renter_booking',
      'renter_applying',
      'renter_checks',
      'renter_offer',
      'referee',
      'owner',
    ]);
  });

  it('UX-ME-1: lists each funnel’s steps in the order section 9 gives them', () => {
    expect(steps('sign_in')).toEqual(['screen_opened', 'method_chosen', 'signed_in']);
    expect(steps('first_run')).toEqual(['signed_in', 'set_up_finished']);
    expect(steps('add_letting')).toEqual(['started', 'draft_reviewed', 'live']);
    expect(steps('first_decision')).toEqual(['live', 'who_views_decided']);
    expect(steps('offer')).toEqual(['checks_back', 'owner_approved', 'offer_sent']);
    expect(steps('ask_to_view')).toEqual(['home_opened', 'pressed', 'sent', 'email_confirmed']);
    expect(steps('saved_search')).toEqual(['no_result', 'saved', 'alert_opened', 'asked_to_view']);
    expect(steps('renter_questions')).toEqual([
      'first_reply_delivered',
      'page_opened',
      'answers_sent',
    ]);
    expect(steps('renter_booking')).toEqual(['invitation_delivered', 'opened', 'booked']);
    expect(steps('renter_applying')).toEqual(['invited', 'opened', 'sent']);
    expect(steps('renter_checks')).toEqual(['asked', 'all_done']);
    expect(steps('renter_offer')).toEqual(['offer_delivered', 'answered']);
    expect(steps('referee')).toEqual(['request_delivered', 'opened', 'sent']);
    expect(steps('owner')).toEqual(['link_sent', 'opened', 'approval_given']);
  });

  it('UX-ME-1: also covers the pilot measure and the tenancy steps, from the record', () => {
    expect(steps('letting')).toEqual([
      'first_enquiry',
      'who_views_decided',
      'applicants_chosen',
      'offer_accepted',
      'agreement_signed',
    ]);
    expect(steps('tenancy')).toEqual([
      'offer_accepted',
      'agreement_signed',
      'payment_received',
      'rtb_registered',
      'finished',
    ]);
    for (const code of ['letting', 'tenancy']) {
      expect(
        byCode(code).steps.every((step) => step.sources.every((s) => s.from === 'record')),
      ).toBe(true);
    }
  });

  it('UX-ME-1: every code is a plain machine code, safe to store in an event', () => {
    const funnelCodes = catalogue.map((funnel) => funnel.code);
    expect(new Set(funnelCodes).size).toBe(funnelCodes.length);
    for (const funnel of catalogue) {
      expect(subjectKinds).toContain(funnel.subject);
      expect(funnel.steps.length).toBeGreaterThan(0);
      const codes = funnel.steps.map((step) => step.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const step of funnel.steps) {
        expect(stepCode(funnel, step)).toMatch(/^[a-z][a-z_]*\.[a-z][a-z_]*$/);
        expect(isSafeEventValue(stepCode(funnel, step))).toBe(true);
        expect(step.sources.length).toBeGreaterThan(0);
      }
    }
  });

  it('UX-ME-1: a step’s time is always counted from an earlier step of the same funnel', () => {
    for (const funnel of catalogue) {
      funnel.steps.forEach((step, index) => {
        if (!step.timedFrom) return;
        const from = funnel.steps.findIndex((s) => s.code === step.timedFrom);
        expect(from, `${funnel.code}.${step.code}`).toBeGreaterThanOrEqual(0);
        expect(from, `${funnel.code}.${step.code}`).toBeLessThan(index);
      });
    }
  });

  it('UX-ME-1: flows that aren’t built yet only need their codes emitted', () => {
    for (const code of [
      'import',
      'forwarding',
      'home',
      'search',
      'ask_to_view',
      'saved_search',
      'profile',
    ]) {
      for (const step of byCode(code).steps) {
        expect(isDirectStep(stepCode(byCode(code), step)), `${code}.${step.code}`).toBe(true);
      }
    }
    expect(isDirectStep('on_gaff.shown')).toBe(true);
    expect(isDirectStep('invite_team.invite_sent')).toBe(true);
    expect(isDirectStep('invite_team.invite_accepted')).toBe(true);
    expect(isDirectStep('add_letting.draft_reviewed')).toBe(true);
  });

  it('UX-ME-1: a step the record already holds is mapped, not written a second time', () => {
    expect(isDirectStep('add_letting.live')).toBe(false);
    expect(isDirectStep('first_run.set_up_finished')).toBe(false);
    expect(isDirectStep('renter_questions.answers_sent')).toBe(false);
    expect(isDirectStep('not_a.step')).toBe(false);
    expect(recordSources()).toContainEqual({
      step: 'first_decision.who_views_decided',
      source: { from: 'record', event: 'shortlist.decided', subject: 'letting' },
    });
    expect(directStepCodes).toContain('sign_in.screen_opened');
    expect(funnelOfDirectStep('sign_in.screen_opened').subject).toBe('attempt');
    expect(funnelOfDirectStep('renter_booking.opened').subject).toBe('application');
  });
});
