import type { SetupStepCode } from '@/domain/dashboard/setup-checklist';
import type { Portal } from '@/domain/lettings/setup';
import { portals as portalNames } from '@/domain/lettings/setup';

/**
 * The words of the setup checklist and the prompts (section 9 of the UX redesign). The people
 * who read these are letting homes, not renters, but they are written the same way: plain, short,
 * and each says what happens next.
 */

/** "Daft", "Daft and MyHome". */
function portalWords(on: readonly Portal[]): string {
  const names = on.map((portal) => portalNames[portal]);
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    : (names[0] ?? 'Daft and MyHome');
}

export const checklistCopy = {
  title: 'Get set up',
  /** Once, the first time Today finds it complete. */
  allSet: 'You’re all set. Anything that needs you shows here.',
  step: (
    code: SetupStepCode,
    who: { ownHome: boolean; portals: readonly Portal[] },
  ): { name: string; why: string; action: string } => {
    switch (code) {
      case 'add_letting':
        return who.ownHome
          ? {
              name: 'Add your home',
              why: 'It takes about ten minutes. Then Gaff answers every enquiry about it.',
              action: 'Add your home',
            }
          : {
              name: 'Add your first letting',
              why: 'It takes about ten minutes. Then Gaff answers every enquiry about it.',
              action: 'Add a letting',
            };
      case 'see_test':
        return {
          name: 'See Gaff answer an enquiry',
          why: 'Send a made-up enquiry and read the reply a renter would get, straight away.',
          action: 'Send a test enquiry',
        };
      case 'forwarding':
        return {
          name: `Send your ${portalWords(who.portals)} enquiries to Gaff`,
          why: 'One rule in your email, about two minutes. Then Gaff answers those too.',
          action: 'Set up forwarding',
        };
      case 'invite_team':
        return {
          name: 'Invite your team',
          why: 'Colleagues see every letting and can cover for each other.',
          action: 'Invite your team',
        };
    }
  },
  /** The list's name for the first step stays the same as it moves on to the test. */
  listName: (code: SetupStepCode, who: { ownHome: boolean; portals: readonly Portal[] }) =>
    checklistCopy.step(code === 'see_test' ? 'add_letting' : code, who).name,
} as const;

export const promptCopy = {
  notNow: 'Not now',
  /** Read out with "Not now", so it says which prompt waits. */
  notNowFor: (title: string) => ` (${title})`,
  add_viewing_times: {
    title: 'Add viewing times',
    text: (address: string) =>
      `People have answered about ${address}. Add a time and they book themselves.`,
    action: 'Add viewing times',
  },
  invite_team: {
    title: 'Invite your team',
    text: 'Colleagues see every letting and can cover for each other.',
    action: 'Invite your team',
  },
  stop_checking: {
    title: 'Stop checking every answer?',
    text: 'You’ve sent Gaff’s last 20 answers without a change. Grounded answers could go straight out.',
    action: 'Change this',
  },
  answer_more: {
    title: 'Gaff can answer more if you add a fact',
    text: 'Five or more people have asked the same thing about one home. Add the answer to its facts and Gaff answers it from then on.',
    action: 'Add a fact',
  },
  /** "It's just me", in the invite flow when it is opened from the checklist. */
  justMe: 'It’s just me',
} as const;
