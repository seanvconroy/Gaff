import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { organisations } from '@/db/schema';
import { env } from '@/lib/env';
import { Stack } from '@/ui/Layout';
import { RenterShell } from '../../r/RenterShell';

export const metadata: Metadata = { title: 'How we use your details' };
export const dynamic = 'force-dynamic';

/**
 * The privacy notice linked from every first reply (GDPR Article 14: renters' details come
 * from Daft or MyHome). DRAFT wording for the solicitor to review before launch.
 */
export default async function PrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [organisation] = await db()
    .select({ name: organisations.name })
    .from(organisations)
    .where(eq(organisations.inboundSlug, slug));
  if (!organisation) notFound();
  const days = env().RETENTION_PERSONAL_DAYS;
  return (
    <RenterShell operatorName={organisation.name}>
      <Stack gap={6}>
        <h1 className="type-display-mobile">How we use your details</h1>
        <p>
          {organisation.name} is responsible for your details. Gaff is the software{' '}
          {organisation.name} uses to answer enquiries and arrange viewings. Gaff only uses your
          details for this home, on {organisation.name}’s behalf.
        </p>
        <h2 className="type-title">What we have, and why</h2>
        <p>
          Your name, email address and phone number came with your enquiry from Daft or MyHome. If
          you answer our questions, we also keep your answers: when you could move in, how long
          you’d like to stay, how many people would live there and whether you have pets. We use
          them only to arrange viewings fairly.
        </p>
        <p>
          We don’t ask for documents, bank statements or your PPS number at this stage. We never ask
          about your family, nationality, age, religion, or whether you get housing assistance.
        </p>
        <h2 className="type-title">An AI assistant helps, and a person decides</h2>
        <p>
          An AI assistant writes some replies, using only facts about the home. It sorts everyone
          the same way, by the criteria for the home and when they enquired. A person at{' '}
          {organisation.name} makes every decision about who views.
        </p>
        <h2 className="type-title">How long we keep it</h2>
        <p>
          If you don’t get the home, your details are deleted automatically {days} days after it’s
          let.
        </p>
        <h2 className="type-title">Your rights</h2>
        <p>
          You can ask to see, correct or delete your details by replying to any of our emails. You
          can also complain to the Data Protection Commission.
        </p>
      </Stack>
    </RenterShell>
  );
}
