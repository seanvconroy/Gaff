import { and, count, eq } from 'drizzle-orm';
import { withOrg } from '@/db/client';
import { applications, inboundEmails, lettings, messages, organisations } from '@/db/schema';
import { stayChoices } from '@/domain/criteria/answers';
import { env } from '@/lib/env';
import { irishToday } from '@/lib/format';
import type { Member } from '@/server/auth/member';
import { processInboundEmail } from '@/server/enquiries/process';
import { receiveInboundEmail } from '@/server/enquiries/receive';
import { saveRenterAnswers } from '@/server/renter/answers';

/**
 * Testing only (DEV_TOOLS=1, never in production): made-up renters enquire about a letting, as
 * if from Daft and MyHome, and most answer the questions, so a tester has a shortlist to work
 * with. Their addresses are at example.ie, so their mail goes to the outbox, where a tester can
 * open their links and play them.
 */

const people = [
  ['Aoife', 'Byrne'],
  ['Ciarán', 'Ó Súilleabháin'],
  ['Nora', 'Walsh'],
  ['Darragh', 'Kennedy'],
  ['Saoirse', 'Murphy'],
  ['Eoin', 'Gallagher'],
  ['Róisín', 'Quinn'],
  ['Tadhg', 'Brennan'],
  ['Méabh', 'Fitzgerald'],
  ['Oisín', 'Doyle'],
  ['Clodagh', 'Nolan'],
  ['Fionn', 'Kavanagh'],
] as const;

const notes = [
  'Hi, is the home still available? I’d love to view it.',
  'Hello, could I view it this week? Is there parking?',
  'Hi, when could I move in? Is broadband connected?',
  'Is it still available? What day are the bins collected?',
  'Hi there, I’m very interested. Could I come to a viewing?',
];

const plain = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '');

const randomDigits = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => String(b % 10)).join('');

function enquiryEmail(
  portal: 'daft' | 'myhome',
  renter: { name: string; email: string; phone: string; note: string },
  address: string,
) {
  if (portal === 'daft') {
    return {
      from: 'Daft.ie <noreply@daft.ie>',
      replyTo: `${renter.name} <${renter.email}>`,
      subject: `New enquiry: ${address}`,
      text: [
        'You have a new enquiry about your ad.',
        '',
        `Property: ${address}`,
        '',
        `Name: ${renter.name}`,
        `Email: ${renter.email}`,
        `Phone: ${renter.phone}`,
        '',
        'Message:',
        renter.note,
        '',
        '--',
        'This email was sent by Daft.ie on behalf of a user.',
      ].join('\n'),
    };
  }
  return {
    from: 'MyHome.ie <enquiries@myhome.ie>',
    replyTo: undefined,
    subject: `MyHome.ie enquiry - ${address}`,
    text: [
      'Contact details',
      `Full name: ${renter.name}`,
      `Email address: ${renter.email}`,
      `Telephone: ${renter.phone}`,
      '',
      `Enquiry: ${renter.note}`,
    ].join('\n'),
  };
}

/** Answers that differ from renter to renter, so the shortlist has something to rank. */
function answersFor(n: number, now: Date): Record<string, string> {
  return {
    moveInDate: irishToday(new Date(now.getTime() + (10 + ((n * 7) % 40)) * 86_400_000)),
    stayMonths: String(stayChoices[(n * 3 + 2) % stayChoices.length]!.months),
    occupants: String(1 + (n % 3)),
    hasPets: n % 4 === 3 ? 'yes' : 'no',
  };
}

/** The application an email was filed under, if it was filed under this letting. */
async function filedUnder(
  member: Member,
  inboundEmailId: string,
  lettingId: string,
): Promise<string | null> {
  const [row] = await withOrg(member.organisationId, (tx) =>
    tx
      .select({ applicationId: inboundEmails.applicationId, lettingId: inboundEmails.lettingId })
      .from(inboundEmails)
      .where(eq(inboundEmails.id, inboundEmailId)),
  );
  return row?.lettingId === lettingId ? row.applicationId : null;
}

export async function addTestEnquiries(
  member: Member,
  lettingId: string,
  howMany = 5,
  now = new Date(),
): Promise<{ added: number; answered: number }> {
  const config = env();
  if (!config.DEV_TOOLS) throw new Error('Dev tools are off');
  const found = await withOrg(member.organisationId, async (tx) => {
    const [letting] = await tx
      .select({
        addressLine1: lettings.addressLine1,
        area: lettings.area,
        slug: organisations.inboundSlug,
      })
      .from(lettings)
      .innerJoin(organisations, eq(organisations.id, lettings.organisationId))
      .where(eq(lettings.id, lettingId));
    const [tally] = await tx
      .select({ value: count() })
      .from(applications)
      .where(eq(applications.lettingId, lettingId));
    return letting ? { ...letting, existing: tally?.value ?? 0 } : null;
  });
  if (!found) return { added: 0, answered: 0 };

  let added = 0;
  let answered = 0;
  const address = `${found.addressLine1}, ${found.area}`;
  for (let i = 0; i < howMany; i++) {
    const n = found.existing + i;
    const [first, last] = people[n % people.length]!;
    const renter = {
      name: `${first} ${last}`,
      email: `${plain(first)}.${plain(last)}.${randomDigits(4)}@example.ie`,
      phone: `08${5 + (n % 3)} ${randomDigits(3)} ${randomDigits(4)}`,
      note: notes[n % notes.length]!,
    };
    const portal = n % 3 === 2 ? 'myhome' : 'daft';
    const email = enquiryEmail(portal, renter, address);
    const providerMessageId = `<test-${crypto.randomUUID()}@dev.gaff.test>`;
    const stored = await receiveInboundEmail({
      provider: 'dev',
      providerMessageId,
      recipient: `${found.slug}@${config.INBOUND_DOMAIN}`,
      from: email.from,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
      receivedAt: now,
    });
    if (stored !== 'stored') continue;
    const [inbound] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ id: inboundEmails.id })
        .from(inboundEmails)
        .where(eq(inboundEmails.providerMessageId, providerMessageId)),
    );
    const outcome = await processInboundEmail({
      organisationId: member.organisationId,
      inboundEmailId: inbound!.id,
      forcedLettingId: lettingId,
    });
    // The worker may have read it first (it's queued as it arrives): then it's already filed.
    const applicationId =
      outcome.kind === 'enquiry'
        ? outcome.applicationId
        : outcome.kind === 'already_processed'
          ? await filedUnder(member, inbound!.id, lettingId)
          : null;
    if (!applicationId) continue;
    added += 1;
    // Most renters answer the questions straight away; every fifth leaves it for later.
    if (n % 5 === 4) continue;
    const [reply] = await withOrg(member.organisationId, (tx) =>
      tx
        .select({ body: messages.body })
        .from(messages)
        .where(and(eq(messages.applicationId, applicationId), eq(messages.kind, 'first_reply'))),
    );
    const token = reply ? /\/r\/([A-Za-z0-9_-]{43})/.exec(reply.body)?.[1] : undefined;
    if (!token) continue;
    const saved = await saveRenterAnswers(token, answersFor(n, now));
    if (saved?.ok) answered += 1;
  }
  return { added, answered };
}
