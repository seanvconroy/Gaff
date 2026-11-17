import { z } from 'zod';

/**
 * UX-AC-6 to UX-AC-10: first run. One question per screen and never more than four. A renter
 * and a private landlord each answer at most two: their name, if sign-in didn't supply it, and
 * what brings them to Gaff. Someone at an agency then finds the agency and says it's theirs.
 *
 * Nothing chosen here fixes anything (UX-AC-8): the other roles stay in the account menu.
 */

/** Why a person came. `own_home` is a private landlord; nobody is asked for more (UX-AC-7). */
export const purposes = ['renting', 'own_home', 'agency'] as const;
export type Purpose = (typeof purposes)[number];

export const firstRunSteps = ['name', 'purpose', 'agency', 'confirm'] as const;
export type FirstRunStep = (typeof firstRunSteps)[number];

/** UX-AC-6: the most questions anyone is asked. */
export const MOST_QUESTIONS = 4;

/**
 * Whether sign-in supplied a name. Google and Apple give one; an email code doesn't, and the
 * account then carries nothing, or the address itself.
 */
export function nameIsKnown(name: string | null | undefined): boolean {
  const given = name?.trim() ?? '';
  return given.length >= 2 && !given.includes('@');
}

/** "What's your name?": one field, first and last. */
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your name')
  .max(80, 'Keep your name under 80 characters')
  .refine((name) => !name.includes('@'), 'Enter your name, not your email address');

/** UX-AC-9: what renters call a private landlord, for now: their first name. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/**
 * Where a person was going when they signed in says why they came, so nobody is asked
 * (section 2, "First run"): "List a home" is someone letting a home they own; Saved and
 * Enquiries are someone renting, and so is someone who ticked "Keep my details for next time" on
 * an application (UX-RN-13): they come back to that home's page. A home's page (WP-20) joins the
 * renting side when it's built.
 */
const KEEPING_DETAILS = /^\/r\/[A-Za-z0-9_-]{43}\/keep$/;

export function purposeFromNext(next: string | null | undefined): Purpose | null {
  if (!next) return null;
  const path = next.split(/[?#]/)[0] ?? '';
  if (path === '/lettings/new') return 'own_home';
  if (path === '/saved' || path === '/enquiries') return 'renting';
  if (KEEPING_DETAILS.test(path)) return 'renting';
  return null;
}

export interface FirstRunState {
  /** Sign-in supplied the name, or they've given it. */
  nameKnown: boolean;
  /** Why they came: known from where they were going, or chosen on the second screen. */
  purpose: Purpose | null;
  /** Agency only: they've picked an entry in the register and haven't said yes to it yet. */
  agencyPicked: boolean;
}

/**
 * The screens this person is asked, in order, as far as is known. Until they say why they came,
 * only the questions everyone gets are counted; choosing "I work at a letting agency" adds two.
 */
export function stepsFor(state: {
  nameKnown: boolean;
  /** Known before any question was asked: the purpose question is skipped. */
  purposeKnownBefore: boolean;
  purpose: Purpose | null;
}): FirstRunStep[] {
  return [
    ...(state.nameKnown ? [] : (['name'] as const)),
    ...(state.purposeKnownBefore ? [] : (['purpose'] as const)),
    ...(state.purpose === 'agency' ? (['agency', 'confirm'] as const) : []),
  ];
}

/** UX-AC-10: where a person is in first run: the first question they haven't answered. */
export function nextStep(state: FirstRunState): FirstRunStep | 'done' {
  if (!state.nameKnown) return 'name';
  if (!state.purpose) return 'purpose';
  if (state.purpose !== 'agency') return 'done';
  return state.agencyPicked ? 'confirm' : 'agency';
}

/** Where first run ends: Search, "Add your home", or Today. */
export function landingFor(purpose: Purpose): '/' | '/lettings/new' | '/today' {
  if (purpose === 'renting') return '/';
  return purpose === 'own_home' ? '/lettings/new' : '/today';
}

/** UX-AG-2: "We're applying for a licence": the one thing asked is what the agency is called. */
export const agencyNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter the name of your agency')
  .max(120, 'Keep the name under 120 characters');
