import { z } from 'zod';
import { nameIsKnown } from '@/domain/accounts/first-run';
import type { Role } from './permissions';

/**
 * UX-AG-15, UX-AG-16, UX-AG-17 (section 2, "When an agent leaves"): the rules for a team's
 * members changing. Every team has at least one admin, and no letting is ever left without a lead.
 */
export interface TeamMember {
  userId: string;
  role: Role;
}

export type MemberChange =
  | { kind: 'remove'; userId: string }
  | { kind: 'leave'; userId: string }
  | { kind: 'change_role'; userId: string; role: Role };

/** Why a change can't be made, or null if it can. */
export type ChangeRefusal = 'not_a_member' | 'last_admin' | 'remove_yourself';

/**
 * UX-AG-16: the last admin can't be removed, leave, or stop being an admin until another member
 * is made admin. Removing yourself is leaving, which is done from Profile (UX-AG-17).
 */
export function refusalFor(
  members: readonly TeamMember[],
  change: MemberChange,
  byUserId?: string,
): ChangeRefusal | null {
  const target = members.find((member) => member.userId === change.userId);
  if (!target) return 'not_a_member';
  if (change.kind === 'remove' && byUserId === change.userId) return 'remove_yourself';
  const otherAdmins = members.filter(
    (member) => member.role === 'admin' && member.userId !== change.userId,
  );
  const stopsBeingAdmin =
    target.role === 'admin' && (change.kind !== 'change_role' || change.role !== 'admin');
  if (stopsBeingAdmin && otherAdmins.length === 0) return 'last_admin';
  return null;
}

export const refusalWords: Record<ChangeRefusal, string> = {
  not_a_member: 'They’re not on the team now.',
  last_admin: 'Every team needs an admin. Make someone else an admin first, then try again.',
  remove_yourself: 'To leave the team yourself, go to your profile.',
};

/** A letting the person leaving leads. */
export interface LedLetting {
  lettingId: string;
}

/**
 * UX-AG-15: who leads each of the leaver's lettings once they've gone. Each goes to the lead
 * chosen for it, if that person stays on the team, or else to `fallback` (the admin removing
 * them, or an admin when someone leaves). Nothing is ever left with nobody.
 */
export function handover(
  led: readonly LedLetting[],
  chosen: Readonly<Record<string, string | undefined>>,
  staying: readonly TeamMember[],
  fallback: string,
): Map<string, string> {
  const stays = new Set(staying.map((member) => member.userId));
  if (!stays.has(fallback)) throw new Error('The fallback lead must stay on the team');
  return new Map(
    led.map(({ lettingId }) => {
      const pick = chosen[lettingId];
      return [lettingId, pick && stays.has(pick) ? pick : fallback];
    }),
  );
}

/** UX-AG-17: when someone leaves, their lettings go to an admin: the longest-standing one. */
export function adminToTakeOver(members: readonly TeamMember[], leaving: string): string | null {
  return (
    members.find((member) => member.role === 'admin' && member.userId !== leaving)?.userId ?? null
  );
}

/**
 * How a member is named on the team's screens. Someone who joined by an invite and signed in by
 * email code was asked nothing (UX-AG-11), so until they give a name their address stands in.
 */
export function shownName(person: { name: string | null; email: string }): string {
  return nameIsKnown(person.name) ? person.name!.trim() : person.email;
}

/** UX-AG-11: at most this many addresses in one go. */
export const MAX_INVITES_AT_ONCE = 20;

const oneEmail = z.email();

/**
 * UX-AG-11: "Invite your team" takes several emails in one field, typed or pasted: split on
 * commas, semicolons, spaces and new lines, lower-cased, each once. Anything that isn't an
 * address comes back as `invalid`, exactly as it was typed, so it can be named at the field.
 */
export function parseInviteEmails(typed: string): { emails: string[]; invalid: string[] } {
  const parts = typed
    .split(/[\s,;]+/)
    .map((part) => part.replace(/^<|>$/g, '').trim())
    .filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const part of parts) {
    const email = part.toLowerCase();
    if (!oneEmail.safeParse(email).success) invalid.push(part);
    else if (!emails.includes(email)) emails.push(email);
  }
  return { emails, invalid };
}

/** What is wrong with what was typed in the invite field, or null. */
export function inviteEmailsProblem(parsed: {
  emails: string[];
  invalid: string[];
}): string | null {
  if (parsed.invalid.length > 0) {
    return `${parsed.invalid[0]} isn’t an email address. Check it, then send again.`;
  }
  if (parsed.emails.length === 0) return 'Enter an email address, like ann@example.ie';
  if (parsed.emails.length > MAX_INVITES_AT_ONCE) {
    return `Invite up to ${MAX_INVITES_AT_ONCE} people at a time.`;
  }
  return null;
}
