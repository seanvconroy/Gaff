/**
 * Prompts, and when they appear (UX-GR-5, UX-GR-6; section 9, "Prompts, and when they appear").
 *
 * A prompt is a single card or line with one action, shown at the moment it's useful. It is
 * never a banner across the top of the product and never a pop-up that blocks a task: each place
 * shows it in its own content, where it can be passed by (UX-GR-6).
 *
 * One function decides, `promptFor`: no screen ever shows more than one prompt, and where two
 * apply the one higher in section 9's table wins (UX-GR-5). Each prompt's condition is a pure
 * rule here, over facts the screen reads. A declined prompt waits at least fourteen days; one
 * shown "once" never comes back once declined.
 *
 * The table, in its order. Where a prompt is shown by a screen that another package built, its
 * condition is that screen's own rule, named here, so the order still holds:
 *
 * |  # | Prompt | Shown to | When | Where |
 * |  1 | Add your first letting | Everyone running lettings | No lettings | Today, as the checklist's first step |
 * |  2 | Set it up? | Everyone running lettings | Enquiries arrive for an unknown home | Today |
 * |  3 | Add viewing times | The letting's lead | People have answered and there are no times | Today and the letting |
 * |  4 | Let the owner follow along | Agency members | Just after go-live with no owner on it | The letting, once |
 * |  5 | Invite your team | Admins | The checklist; and a sole admin with a live letting | Today |
 * |  6 | Share with a colleague | Agency members | Always available | The letting's menu |
 * |  7 | Sign in faster next time | Everyone | After the first sign-in on a capable device | A sheet, once (`src/domain/auth`) |
 * |  8 | Gaff can answer more if you add… | The letting's lead | The same unknown question asked five times | Inbox |
 * |  9 | Stop checking every answer? | Admins and private landlords | 20 drafts in a row sent without edits | Today, once |
 * | 10 | Send Mary the summary | Agency members | A letting has just closed and the owner hasn't seen it | The results screen |
 * | 11 | Add your next letting | Everyone running lettings | A letting has just closed | The results screen |
 * | 12 | Keep my details for next time | Renters without a profile | Applying; a letting ends for them | The renter's page (`src/domain/profile`) |
 * | 13 | Tell me when one comes up | Renters | A search finds nothing | Search (`src/domain/saved`) |
 *
 * The two on the results screen follow UX-TN-6's order (`nextAfterLet` in
 * `src/domain/tenancy/results.ts`): the summary first. They are the only pair that meet on one
 * screen, and "Add your next letting" applies whenever a letting closes, so in the table's own
 * order the owner's summary would never be offered.
 */

export const promptCodes = [
  'add_first_letting',
  'set_up_unknown_home',
  'add_viewing_times',
  'owner_follow_along',
  'invite_team',
  'share_with_colleague',
  'passkey',
  'answer_more',
  'stop_checking',
  'send_owner_summary',
  'add_next_letting',
  'keep_my_details',
  'tell_me_when',
] as const;
export type PromptCode = (typeof promptCodes)[number];

/** Where a prompt can appear. */
export type PromptPlace =
  | 'today'
  | 'letting'
  | 'letting_menu'
  | 'after_sign_in'
  | 'inbox'
  | 'results'
  | 'renter_page'
  | 'search';

export interface PromptRule {
  code: PromptCode;
  places: readonly PromptPlace[];
  /** Shown once: declined, it never comes back. Otherwise a decline waits fourteen days. */
  once: boolean;
  /** A prompt that can be declined has "Not now". One that is always there, or a step, hasn't. */
  declinable: boolean;
}

/** The table, in order. The order is the rule: the first that applies wins. */
export const promptTable: readonly PromptRule[] = [
  { code: 'add_first_letting', places: ['today'], once: false, declinable: false },
  { code: 'set_up_unknown_home', places: ['today'], once: false, declinable: false },
  { code: 'add_viewing_times', places: ['today', 'letting'], once: false, declinable: true },
  { code: 'owner_follow_along', places: ['letting'], once: true, declinable: false },
  { code: 'invite_team', places: ['today'], once: false, declinable: true },
  { code: 'share_with_colleague', places: ['letting_menu'], once: false, declinable: false },
  { code: 'passkey', places: ['after_sign_in'], once: true, declinable: true },
  { code: 'answer_more', places: ['inbox'], once: false, declinable: true },
  { code: 'stop_checking', places: ['today'], once: true, declinable: true },
  { code: 'send_owner_summary', places: ['results'], once: false, declinable: false },
  { code: 'add_next_letting', places: ['results'], once: false, declinable: false },
  { code: 'keep_my_details', places: ['renter_page'], once: false, declinable: false },
  { code: 'tell_me_when', places: ['search'], once: false, declinable: false },
];

export const DECLINE_WAITS_DAYS = 14;

/** "Stop checking every answer?" waits for twenty drafts in a row sent without edits. */
export const CLEAN_SENDS_FOR_STOP_CHECKING = 20;

/** "Gaff can answer more if you add…" waits for the same question five times. */
export const SAME_QUESTION_TIMES = 5;

/** Who is looking. */
export interface PromptViewer {
  userId: string;
  role: 'admin' | 'negotiator';
  organisationKind: 'agency' | 'landlord' | 'private_landlord';
  /** People on the team, the viewer included. */
  members: number;
}

/** A home, as the prompts about one need it. */
export interface PromptLetting {
  id: string;
  addressLine1: string;
  status: string;
  /** UX-AG-9: who leads it. */
  leadUserId: string | null;
  /** People who have answered and are waiting for a person to choose who views. */
  answered: number;
  /** Viewing times still to come. */
  viewingTimesAhead: number;
}

/**
 * What the screen knows. Each place fills in what its prompts read; a prompt whose facts aren't
 * given doesn't apply.
 */
export interface PromptFacts {
  viewer: PromptViewer;
  /** The setup checklist is showing: it is Today's prompt, with its own steps (UX-GR-1). */
  checklistShowing?: boolean;
  /** Enquiries Gaff couldn't place, for a home it doesn't know (UX-LT-16). */
  unknownHomeEnquiries?: number;
  /** The homes the prompts are about: all of them on Today; the one on its page. */
  homes?: readonly PromptLetting[];
  /** Just after go-live, an agency's home with no owner on it (UX-OW-1). */
  justLiveWithoutOwner?: boolean;
  /** An invite was sent, or "It's just me" chosen. */
  teamAnswered?: boolean;
  /** R29: answers wait for a person's approval. */
  approveBeforeSend?: boolean;
  /** The approvals of AI drafts, newest first, as far back as twenty: whether each was edited. */
  recentApprovals?: readonly { edited: boolean }[];
  /** The open question asked most often about one home, and how many times. */
  repeatedQuestion?: { lettingId: string; times: number } | null;
  /** The results screen: the owner of an agency's home hasn't seen the summary. */
  ownerHasSeenSummary?: boolean;
  /** The results screen is showing: a letting has just closed. */
  justClosed?: boolean;
}

export type Prompt =
  | { code: 'add_first_letting' }
  | { code: 'set_up_unknown_home' }
  | { code: 'add_viewing_times'; lettingId: string; address: string }
  | { code: 'owner_follow_along' }
  | { code: 'invite_team' }
  | { code: 'answer_more'; lettingId: string }
  | { code: 'stop_checking' }
  | { code: 'send_owner_summary' }
  | { code: 'add_next_letting' };

const isAgency = (v: PromptViewer) => v.organisationKind === 'agency';
const isAdmin = (v: PromptViewer) => v.role === 'admin';
const hasTeam = (v: PromptViewer) => v.organisationKind !== 'private_landlord';

/** Each prompt's condition: the prompt it gives, or null when it doesn't apply. */
export const promptConditions: Record<PromptCode, (facts: PromptFacts) => Prompt | null> = {
  // While the setup checklist shows, it is Today's prompt: this is its first step, and "Invite
  // your team" its last (UX-AG-13). Someone with no checklist (UX-GR-4) is offered "Add a
  // letting" by Today's empty state instead.
  add_first_letting: (f) => (f.checklistShowing ? { code: 'add_first_letting' } : null),
  set_up_unknown_home: (f) =>
    (f.unknownHomeEnquiries ?? 0) > 0 ? { code: 'set_up_unknown_home' } : null,
  add_viewing_times: (f) => {
    const home = (f.homes ?? []).find(
      (h) =>
        h.status === 'live' &&
        h.leadUserId === f.viewer.userId &&
        h.answered > 0 &&
        h.viewingTimesAhead === 0,
    );
    return home
      ? { code: 'add_viewing_times', lettingId: home.id, address: home.addressLine1 }
      : null;
  },
  owner_follow_along: (f) =>
    isAgency(f.viewer) && f.justLiveWithoutOwner ? { code: 'owner_follow_along' } : null,
  invite_team: (f) =>
    isAdmin(f.viewer) &&
    hasTeam(f.viewer) &&
    f.viewer.members === 1 &&
    f.teamAnswered === false &&
    (f.homes ?? []).some((h) => h.status === 'live')
      ? { code: 'invite_team' }
      : null,
  // Always in the letting's menu, for an agency member who may invite (WP-19). Never competes.
  share_with_colleague: () => null,
  // A sheet of its own after sign-in (UX-SI-4, `src/domain/auth`). Nothing else is on it.
  passkey: () => null,
  answer_more: (f) =>
    f.repeatedQuestion && f.repeatedQuestion.times >= SAME_QUESTION_TIMES
      ? { code: 'answer_more', lettingId: f.repeatedQuestion.lettingId }
      : null,
  stop_checking: (f) => {
    const allowed = isAdmin(f.viewer) || f.viewer.organisationKind === 'private_landlord';
    const recent = (f.recentApprovals ?? []).slice(0, CLEAN_SENDS_FOR_STOP_CHECKING);
    return allowed &&
      f.approveBeforeSend === true &&
      recent.length === CLEAN_SENDS_FOR_STOP_CHECKING &&
      recent.every((approval) => !approval.edited)
      ? { code: 'stop_checking' }
      : null;
  },
  send_owner_summary: (f) =>
    f.justClosed && isAgency(f.viewer) && f.ownerHasSeenSummary === false
      ? { code: 'send_owner_summary' }
      : null,
  add_next_letting: (f) => (f.justClosed ? { code: 'add_next_letting' } : null),
  // The renter's page and search are a renter's: their own rules decide (`keepingFor`,
  // "Tell me when one comes up"), and no operator's prompt is ever on them.
  keep_my_details: () => null,
  tell_me_when: () => null,
};

/** When each prompt was last declined by this person. */
export type Declines = Partial<Record<PromptCode, Date>>;

/** Whether a decline still holds: fourteen days, or for good for a prompt shown once. */
export function declineHolds(rule: PromptRule, declinedAt: Date | undefined, now: Date): boolean {
  if (!declinedAt) return false;
  if (rule.once) return true;
  return now.getTime() - declinedAt.getTime() < DECLINE_WAITS_DAYS * 86_400_000;
}

/**
 * UX-GR-5: the one prompt for this place, or none. The first in the table that is shown here,
 * applies, and hasn't been declined lately.
 */
export function promptFor(
  place: PromptPlace,
  facts: PromptFacts,
  declines: Declines = {},
  now: Date = new Date(),
): Prompt | null {
  for (const rule of promptTable) {
    if (!rule.places.includes(place)) continue;
    if (declineHolds(rule, declines[rule.code], now)) continue;
    const prompt = promptConditions[rule.code](facts);
    if (prompt) return prompt;
  }
  return null;
}

export function ruleFor(code: PromptCode): PromptRule {
  return promptTable.find((rule) => rule.code === code)!;
}

/** The prompts a person can say "Not now" to, as codes a form may send. */
export function isDeclinablePrompt(value: unknown): value is PromptCode {
  return (
    typeof value === 'string' &&
    promptTable.some((rule) => rule.code === value && rule.declinable)
  );
}

/**
 * "Gaff can answer more if you add…": the same unknown question, asked about one home. Renters'
 * words differ in case, spaces and punctuation, so a question is compared in a plain form. The
 * question is untrusted text: it is only compared, never followed or shown in a prompt.
 */
export function plainQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function mostRepeatedQuestion(
  questions: readonly { lettingId: string; question: string }[],
): { lettingId: string; times: number } | null {
  const counts = new Map<string, { lettingId: string; times: number }>();
  for (const q of questions) {
    const plain = plainQuestion(q.question);
    if (!plain) continue;
    const key = `${q.lettingId}\u0000${plain}`;
    const seen = counts.get(key) ?? { lettingId: q.lettingId, times: 0 };
    seen.times += 1;
    counts.set(key, seen);
  }
  let best: { lettingId: string; times: number } | null = null;
  for (const each of counts.values()) if (!best || each.times > best.times) best = each;
  return best;
}
