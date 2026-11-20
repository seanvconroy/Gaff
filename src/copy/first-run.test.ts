import { describe, expect, it } from 'vitest';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import { firstRunSteps, purposes } from '@/domain/accounts/first-run';
import {
  agencyConfirmedEmail,
  agencyInviteEmail,
  licenceLapsedEmail,
  licenceRenewedEmail,
  memberConflictEmail,
} from './account-emails';
import { layOutGaffEmail } from './email-layout';
import { firstRunCopy } from './first-run';
import { goLiveCopy } from './go-live';

const APP = 'https://app.gaff.test';
const emails = [
  agencyConfirmedEmail({ agencyName: 'Halcyon Lettings', wentLive: 0, todayUrl: `${APP}/today` }),
  agencyConfirmedEmail({ agencyName: 'Halcyon Lettings', wentLive: 1, todayUrl: `${APP}/today` }),
  agencyConfirmedEmail({ agencyName: 'Halcyon Lettings', wentLive: 3, todayUrl: `${APP}/today` }),
  agencyInviteEmail({ agencyName: 'Halcyon Lettings', joinUrl: `${APP}/join`, days: 7 }),
  licenceLapsedEmail({
    agencyName: 'Halcyon Lettings',
    licenceNumber: '001234',
    lettingsUrl: `${APP}/lettings`,
  }),
  licenceRenewedEmail({ agencyName: 'Halcyon Lettings', lettingsUrl: `${APP}/lettings` }),
  memberConflictEmail({
    memberName: 'Ann Power',
    address: '12 Ranelagh Road',
    lettingUrl: `${APP}/lettings/3f0c`,
  }),
];

/** Every sentence first run, the go-live step and these emails can show or send. */
function everySentence(): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  const c = firstRunCopy;
  walk({
    ...c,
    purpose: { ...c.purpose, titleAfterName: c.purpose.titleAfterName('Ann') },
    agency: {
      ...c.agency,
      found: [c.agency.found(1), c.agency.found(3)],
      registeredAs: c.agency.registeredAs('Halcyon Lettings Limited'),
      licence: c.agency.licence('001234'),
      none: c.agency.none('Halcyon'),
    },
    confirm: { ...c.confirm, onGaff: c.confirm.onGaff('Halcyon Lettings') },
    asked: { ...c.asked, title: c.asked.title('Halcyon Lettings') },
  });
  walk({
    waiting: goLiveCopy.waiting('Halcyon Lettings'),
    held: Object.values(goLiveCopy.held).map((say) => say('Halcyon Lettings')),
    findLicence: goLiveCopy.findLicence,
  });
  for (const email of emails) out.push(email.subject, email.text, email.button);
  return out;
}

describe('UX-AC-6: the questions of first run, in the assistant’s voice', () => {
  it('asks the three questions section 2 gives, as questions', () => {
    expect(firstRunCopy.name.title).toBe('Let’s get you started. What’s your name?');
    expect(firstRunCopy.purpose.titleFirst).toBe('Let’s get you started. What brings you to Gaff?');
    expect(firstRunCopy.purpose.titleAfterName('Ann')).toBe(
      'Thanks, Ann. What brings you to Gaff?',
    );
    expect(firstRunCopy.agency.title).toBe('Which agency?');
    expect(firstRunCopy.confirm.title).toBe('Is this your agency?');
    expect(firstRunCopy.confirm.yes).toBe('Yes, that’s us');
  });

  it('offers the three choices in section 2’s words', () => {
    expect(purposes.map((purpose) => firstRunCopy.purpose.options[purpose])).toEqual([
      'I’m looking for a home',
      'I’m letting a home I own',
      'I work at a letting agency',
    ]);
  });

  it('names every part of the progress', () => {
    expect(firstRunSteps.map((step) => firstRunCopy.segments[step])).toEqual([
      'You',
      'What you need',
      'Your agency',
      'Check',
    ]);
  });

  it('UX-AG-2, UX-AG-3: the ways on when the agency isn’t found, or is already on Gaff', () => {
    expect(firstRunCopy.agency.byLicence).toBe('Enter the licence number instead');
    expect(firstRunCopy.agency.applying).toBe('We’re applying for a licence');
    expect(firstRunCopy.confirm.askToJoin).toBe('Ask to join');
    expect(firstRunCopy.confirm.onGaff('Halcyon Lettings')).toBe(
      'Halcyon Lettings is already on Gaff.',
    );
  });

  it('Q39: credits the PSRA for its register', () => {
    expect(firstRunCopy.agency.credit).toContain('PSRA’s register');
  });
});

describe('UX-AG-4: the go-live step while an agency is being confirmed', () => {
  it('says the exact words of section 2', () => {
    expect(goLiveCopy.waiting('Halcyon Lettings')).toBe(
      'We’re confirming Halcyon Lettings. This usually takes under an hour. We’ll email you, and this home will go live then.',
    );
  });

  it('UX-AG-6: a lapsed licence says that live homes carry on, and what happens next', () => {
    const words = goLiveCopy.held.licence_lapsed('Halcyon Lettings');
    expect(words).toContain('The homes you have live carry on.');
    expect(words).toContain('we’ll email you when it’s back');
  });
});

describe('the voice: plain, warm, short, and no tagline', () => {
  it('UX-SI-7: carries no description of Gaff and no tagline', () => {
    for (const sentence of everySentence()) {
      expect(sentence).not.toMatch(/runs the letting|from the first enquiry|signed tenancy/i);
      expect(sentence).not.toMatch(/welcome to gaff|the easy way|workspace/i);
    }
  });

  it('has no exclamation marks, no blame and no jargon', () => {
    for (const sentence of everySentence()) {
      expect(sentence, sentence).not.toContain('!');
      expect(sentence, sentence).not.toMatch(/invalid|illegal|failed|you must|unfortunately/i);
      expect(sentence, sentence).not.toMatch(/onboard|tenant ?id|organisation/i);
    }
  });

  it('rule 3: asks about, and mentions, no protected ground', () => {
    for (const sentence of everySentence()) {
      expect(findProtectedGrounds(sentence), sentence).toEqual([]);
    }
  });

  it('UX-AC-7: never asks a landlord for a business name or a licence', () => {
    const forEveryone = [
      firstRunCopy.name,
      firstRunCopy.purpose.titleFirst,
      firstRunCopy.purpose.title,
      firstRunCopy.purpose.options,
      firstRunCopy.purpose.missing,
    ];
    expect(JSON.stringify(forEveryone)).not.toMatch(/licence|business|company/i);
  });
});

describe('UX-AG-4 to UX-AG-6: emails from Gaff about an agency', () => {
  it('each has one web address, on a line of its own, which becomes the one button', () => {
    for (const email of emails) {
      const addresses = email.text.match(/https?:\/\/\S+/g) ?? [];
      expect(addresses, email.subject).toHaveLength(1);
      expect(email.text.split('\n')).toContain(addresses[0]);
      const { html, text } = layOutGaffEmail({
        subject: email.subject,
        body: email.text,
        button: email.button,
        appUrl: APP,
      });
      // The words are sent as written; the layout only changes how they look (UX-PP-10).
      expect(text).toBe(email.text);
      expect(html.match(/data-email="button"/g), email.subject).toHaveLength(1);
      expect(html).toContain(`>${email.button}</a>`);
      expect(html).toContain('alt="Gaff"');
    }
  });

  it('each ends with what happens next, and is signed by Gaff', () => {
    for (const email of emails) {
      expect(email.text.trimEnd().endsWith('Gaff'), email.subject).toBe(true);
    }
    expect(agencyConfirmedEmail({ agencyName: 'A', wentLive: 0, todayUrl: APP }).text).toContain(
      'You can put a home live whenever it’s ready.',
    );
    expect(emails[4]!.text).toContain('we’ll email you as soon as it’s back');
  });

  it('UX-AG-4: says how many homes went live with the confirmation', () => {
    expect(emails[1]!.text).toContain('The home you were ready to put live is live now');
    expect(emails[2]!.text).toContain('The 3 homes you were ready to put live are live now');
  });

  it('UX-AG-5: the invitation says who invited them, to which agency, and for how long', () => {
    const invite = emails[3]!;
    expect(invite.subject).toBe('Join Halcyon Lettings on Gaff');
    expect(invite.button).toBe('Join Halcyon Lettings');
    expect(invite.text).toContain('Gaff’s team has set up Halcyon Lettings on Gaff');
    expect(invite.text).toContain('The invitation works for 7 days.');
  });
});
