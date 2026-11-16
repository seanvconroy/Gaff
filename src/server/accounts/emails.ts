import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { emailSender, gaffSender } from '@/adapters/email';
import {
  type AccountEmail,
  agencyConfirmedEmail,
  agencyInviteEmail,
  licenceLapsedEmail,
  licenceRenewedEmail,
} from '@/copy/account-emails';
import { layOutGaffEmail } from '@/copy/email-layout';
import { withOrg } from '@/db/client';
import { memberships, organisationInvites, organisations, users } from '@/db/schema';
import { env } from '@/lib/env';
import { INVITE_LASTS_DAYS } from './invites';

/**
 * Email from Gaff to the people who run an agency, about the agency's place on Gaff: that it's
 * confirmed (UX-AG-4), an invitation to its first admin (UX-AG-5), and word about its licence
 * (UX-AG-6). Each is queued in the transaction that made the change, and sent by the worker, so
 * an email goes if and only if the change happened, and is tried again if sending fails.
 *
 * The job's payload holds IDs and a count. The address is read here, when the email is sent.
 */
export const accountEmailJob = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('agency_confirmed'),
    organisationId: z.uuid(),
    wentLive: z.number().int().min(0),
  }),
  z.object({ kind: z.literal('licence_lapsed'), organisationId: z.uuid() }),
  z.object({ kind: z.literal('licence_renewed'), organisationId: z.uuid() }),
  z.object({ kind: z.literal('agency_invite'), organisationId: z.uuid(), inviteId: z.uuid() }),
]);
export type AccountEmailJob = z.infer<typeof accountEmailJob>;

/** Where the invite email's button leads: sign-in, then into the agency (src/app/join). */
export const JOIN_PATH = '/join';

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

export async function sendAccountEmail(payload: unknown, attemptKey = ''): Promise<void> {
  const job = accountEmailJob.parse(payload);
  const app = env().APP_URL.replace(/\/$/, '');
  const found = await withOrg(job.organisationId, async (tx) => {
    const [agency] = await tx
      .select({ name: organisations.name, licenceNumber: organisations.psraLicenceNumber })
      .from(organisations)
      .where(eq(organisations.id, job.organisationId));
    if (!agency) return null;
    const admins = await tx
      .select({ id: users.id, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(eq(memberships.organisationId, job.organisationId), eq(memberships.role, 'admin')),
      );
    const [invite] =
      job.kind === 'agency_invite'
        ? await tx
            .select({ email: organisationInvites.email })
            .from(organisationInvites)
            .where(eq(organisationInvites.id, job.inviteId))
        : [];
    return { agency, admins, invite: invite ?? null };
  });
  if (!found) return;
  const { agency, admins, invite } = found;
  const key = (to: string) => `account-${job.kind}-${job.organisationId}-${to}-${attemptKey}`;

  if (job.kind === 'agency_invite') {
    // Accepted or expired since it was queued: there's nobody to write to.
    if (!invite) return;
    await send(
      invite.email,
      agencyInviteEmail({
        agencyName: agency.name,
        joinUrl: `${app}${JOIN_PATH}`,
        days: INVITE_LASTS_DAYS,
      }),
      `account-agency_invite-${job.inviteId}`,
    );
    return;
  }
  const email =
    job.kind === 'agency_confirmed'
      ? agencyConfirmedEmail({
          agencyName: agency.name,
          wentLive: job.wentLive,
          todayUrl: `${app}/today`,
        })
      : job.kind === 'licence_lapsed'
        ? licenceLapsedEmail({
            agencyName: agency.name,
            licenceNumber: agency.licenceNumber ?? '',
            lettingsUrl: `${app}/lettings`,
          })
        : licenceRenewedEmail({ agencyName: agency.name, lettingsUrl: `${app}/lettings` });
  for (const admin of admins) await send(admin.email, email, key(admin.id));
}
