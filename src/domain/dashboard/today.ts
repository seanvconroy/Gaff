import type { TenancyStep } from '@/domain/tenancy/steps';

/**
 * R28: what needs a person today, most urgent first. Renters waiting on a reply come first,
 * then people to mark at today's viewings, then applicants to choose from (R17), then who to
 * invite (soonest viewings first), then listed homes with no pin on the map, then homes still
 * being set up. Gaff only lists these; a person does each one.
 */
export interface LettingSnapshot {
  id: string;
  addressLine1: string;
  status: string;
  /** People who enquired and are waiting for a person to decide who views. */
  undecided: number;
  /** People booked at a viewing that has started and who aren't marked yet. */
  toMark: number;
  /** People who applied, while nobody has been chosen yet (R17). */
  toChoose: number;
  /** R20: chosen and approved, so the offer can go. */
  readyToOffer?: boolean;
  /** R19, R20: the landlord declined, or the offer wasn't accepted and nothing else is out. */
  needsNewChoice?: boolean;
  /** R24: the tenancy has started and isn't registered with the RTB: the deadline. */
  rtbDueBy?: string | null;
  /** Stage 8: the operator's next step on the tenancy, if it's theirs. */
  tenancyStep?: TenancyStep | null;
  /** M38, M125: its listing is public, but the home's pin isn't placed, so it's off the map. */
  needsPin?: boolean;
  firstViewingAt: Date | null;
}

export type TodayItem =
  | { kind: 'approvals' | 'attention' | 'questions'; count: number }
  | { kind: 'offer' | 'rechoose'; lettingId: string; address: string }
  | { kind: 'rtb'; lettingId: string; address: string; dueBy: string }
  | { kind: 'tenancy'; lettingId: string; address: string; step: TenancyStep }
  | {
      kind: 'attendance' | 'choose' | 'shortlist';
      lettingId: string;
      address: string;
      count: number;
    }
  | { kind: 'pin' | 'setup'; lettingId: string; address: string };

export function needsYouToday(input: {
  approvals: number;
  attention: number;
  questions: number;
  lettings: readonly LettingSnapshot[];
}): TodayItem[] {
  const items: TodayItem[] = [];
  if (input.approvals > 0) items.push({ kind: 'approvals', count: input.approvals });
  if (input.attention > 0) items.push({ kind: 'attention', count: input.attention });
  if (input.questions > 0) items.push({ kind: 'questions', count: input.questions });
  for (const l of input.lettings) {
    if (l.toMark > 0) {
      items.push({ kind: 'attendance', lettingId: l.id, address: l.addressLine1, count: l.toMark });
    }
  }
  for (const l of input.lettings) {
    if (l.tenancyStep) {
      items.push({
        kind: 'tenancy',
        lettingId: l.id,
        address: l.addressLine1,
        step: l.tenancyStep,
      });
    }
  }
  // R24: a legal deadline, so it comes straight after today's viewings.
  for (const l of input.lettings) {
    if (l.rtbDueBy)
      items.push({ kind: 'rtb', lettingId: l.id, address: l.addressLine1, dueBy: l.rtbDueBy });
  }
  for (const l of input.lettings) {
    if (l.status === 'live' && l.toChoose > 0) {
      items.push({ kind: 'choose', lettingId: l.id, address: l.addressLine1, count: l.toChoose });
    }
  }
  for (const l of input.lettings) {
    if (l.status !== 'live') continue;
    if (l.readyToOffer) items.push({ kind: 'offer', lettingId: l.id, address: l.addressLine1 });
    if (l.needsNewChoice) {
      items.push({ kind: 'rechoose', lettingId: l.id, address: l.addressLine1 });
    }
  }
  const soonest = (l: LettingSnapshot) => l.firstViewingAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  for (const l of [...input.lettings].sort((a, b) => soonest(a) - soonest(b))) {
    if (l.status === 'live' && l.undecided > 0) {
      items.push({
        kind: 'shortlist',
        lettingId: l.id,
        address: l.addressLine1,
        count: l.undecided,
      });
    }
  }
  // M125: a home that's listed but not on the map yet. Nobody is waiting on it, so it's late.
  for (const l of input.lettings) {
    if (l.needsPin) items.push({ kind: 'pin', lettingId: l.id, address: l.addressLine1 });
  }
  for (const l of input.lettings) {
    if (l.status === 'draft')
      items.push({ kind: 'setup', lettingId: l.id, address: l.addressLine1 });
  }
  return items;
}
