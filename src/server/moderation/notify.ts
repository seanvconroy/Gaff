import { and, eq, inArray } from 'drizzle-orm';
import { emailSender, gaffSender } from '@/adapters/email';
import { db } from '@/db/client';
import { memberships, users } from '@/db/schema';

/** Statements of reasons go to the agent handling the listing, or the account's admins. */
export async function emailLetter(
  organisationId: string,
  agentUserId: string | null,
  email: { subject: string; text: string },
): Promise<void> {
  const people = await db()
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organisationId, organisationId),
        agentUserId ? eq(memberships.userId, agentUserId) : inArray(memberships.role, ['admin']),
      ),
    );
  for (const person of people) {
    await emailSender().send({ to: person.email, from: gaffSender(), ...email });
  }
}

export async function emailPerson(to: string, email: { subject: string; text: string }) {
  await emailSender().send({ to, from: gaffSender(), ...email });
}
