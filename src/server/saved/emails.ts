import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { emailSender, gaffSender } from '@/adapters/email';
import type { AccountEmail } from '@/copy/account-emails';
import { layOutGaffEmail } from '@/copy/email-layout';
import { confirmSearchEmail, searchAlertEmail, searchWords } from '@/copy/saved';
import { cardLine } from '@/copy/search';
import { withSystem } from '@/db/client';
import { savedSearches, users } from '@/db/schema';
import { type AlertFrequency, alertFrequencySchema, filtersToKeep } from '@/domain/saved/saved';
import { searchHref } from '@/domain/search/filters';
import { openJson } from '@/lib/crypto';
import { env } from '@/lib/env';
import { formatRent } from '@/lib/format';
import { publicHomePages } from '@/server/homes/public-homes';
import { nameKey, placeNames } from '@/server/search/where';

/**
 * The emails of saved searches (UX-SR-10): the one that confirms an address, and the alert. Each
 * is queued in the transaction that made it due and sent here by the worker, through the
 * approved email provider only (section 11). The job's payload holds IDs and public references;
 * the address is read here, when the email is sent, and never logged.
 */
export const savedSearchEmailJob = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('confirm'), savedSearchId: z.uuid() }),
  z.object({
    kind: z.literal('alert'),
    /** M86: how these searches hear, for the words and the switch at the foot. */
    frequency: alertFrequencySchema.default('daily'),
    /** The searches of one person or address that found a home, the first leading. */
    savedSearchIds: z.array(z.uuid()).min(1),
    /** The homes, by public reference, newest first. */
    homeRefs: z.array(z.string().regex(/^[0-9a-f]{12}$/)).min(1),
    /** The alert's own run, so a retry of this email is the same email. */
    alertId: z.uuid(),
  }),
]);
export type SavedSearchEmailJob = z.infer<typeof savedSearchEmailJob>;

/** Where a search's links go: confirm, or stop. The token is in the path; only its hash is kept. */
export const alertPaths = {
  confirm: (token: string) => `/alerts/${token}`,
  stop: (token: string) => `/alerts/${token}/stop`,
  /** M86: hear about these once a day instead, or as soon as a home is listed. */
  frequency: (token: string, to: AlertFrequency) => `/alerts/${token}/${to}`,
};

async function send(to: string, email: AccountEmail, key: string): Promise<void> {
  const laidOut = layOutGaffEmail({
    subject: email.subject,
    body: email.text,
    button: email.button,
    appUrl: env().APP_URL,
  });
  await emailSender().send({
    to,
    from: gaffSender(),
    subject: email.subject,
    text: laidOut.text,
    html: laidOut.html,
    idempotencyKey: key,
  });
}

export async function sendSavedSearchEmail(payload: unknown): Promise<void> {
  const job = savedSearchEmailJob.parse(payload);
  const app = env().APP_URL.replace(/\/$/, '');
  const ids = job.kind === 'confirm' ? [job.savedSearchId] : job.savedSearchIds;
  const rows = await withSystem((tx) =>
    tx
      .select({
        id: savedSearches.id,
        email: savedSearches.email,
        accountEmail: users.email,
        filters: savedSearches.filters,
        tokenSealed: savedSearches.tokenSealed,
      })
      .from(savedSearches)
      .leftJoin(users, eq(users.id, savedSearches.userId))
      .where(inArray(savedSearches.id, ids)),
  );
  // Stopped or deleted since it was queued: there's nobody to write to.
  const searches = ids
    .map((id) => rows.find((row) => row.id === id))
    .filter((row) => row !== undefined);
  const lead = searches[0];
  if (!lead) return;
  const to = lead.email ?? lead.accountEmail;
  if (!to) return;
  const token = openJson<string>(lead.tokenSealed);
  // Each search's place, as Gaff's own place index names it.
  const names = await placeNames(searches.map((search) => filtersToKeep(search.filters)));
  const wordsOf = (filters: unknown) => {
    const kept = filtersToKeep(filters);
    return searchWords(kept, new Date(), names.get(nameKey(kept)) ?? '');
  };

  if (job.kind === 'confirm') {
    await send(
      to,
      confirmSearchEmail({
        search: wordsOf(lead.filters),
        confirmUrl: `${app}${alertPaths.confirm(token)}`,
      }),
      `saved-search-confirm-${lead.id}`,
    );
    return;
  }

  // A home let or taken off Gaff since the alert was queued is left out.
  const pages = await publicHomePages(job.homeRefs);
  const homes = job.homeRefs.flatMap((ref) => {
    const page = pages.get(ref);
    if (page?.state !== 'live') return [];
    const { home } = page.home;
    return [
      {
        address: `${home.addressLine1}, ${cardLine(home).split(' · ')[1] ?? home.area}`,
        rent: formatRent(home.monthlyRentCents),
        url: `${app}${page.home.href}`,
      },
    ];
  });
  if (homes.length === 0) return;
  await send(
    to,
    searchAlertEmail({
      homes,
      searches: searches.map((search) => wordsOf(search.filters)),
      searchUrl: `${app}${searchHref(filtersToKeep(lead.filters))}`,
      stopUrl: `${app}${alertPaths.stop(token)}`,
      frequency: job.frequency,
      switchUrl: `${app}${alertPaths.frequency(token, job.frequency === 'instant' ? 'daily' : 'instant')}`,
    }),
    `saved-search-alert-${job.alertId}`,
  );
}
