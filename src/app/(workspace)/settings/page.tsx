import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { db } from '@/db/client';
import { organisations } from '@/db/schema';
import { env } from '@/lib/env';
import { requireMember } from '@/server/auth/member';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { Notice } from '@/ui/Notice';
import styles from './settings.module.css';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const member = await requireMember();
  const [organisation] = await db()
    .select()
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  const address = `${organisation!.inboundSlug}@${env().INBOUND_DOMAIN}`;

  return (
    <Stack gap={8}>
      <PageHeader eyebrow={member.organisationName} title="Settings" />

      <Card labelledBy="address-heading">
        <h2 id="address-heading" className="type-title">
          Your Gaff address
        </h2>
        <p>Send your Daft and MyHome enquiries here, and Gaff answers every one.</p>
        <p className={styles.address}>
          <code>{address}</code>
        </p>
        <h3 className="type-title">Set up forwarding once</h3>
        <ol className={styles.steps}>
          <li>
            <strong>Gmail:</strong> in Settings, open Forwarding and add {address}. Then create a
            filter for emails from <code>daft.ie</code> or <code>myhome.ie</code> and choose
            “Forward it to” your Gaff address.
          </li>
          <li>
            <strong>Outlook:</strong> in Settings, open Rules and add a rule: if the sender contains{' '}
            <code>daft.ie</code> or <code>myhome.ie</code>, forward to your Gaff address.
          </li>
        </ol>
        <Notice tone="info" title="Gmail asks you to confirm">
          <p>
            Gmail sends a confirmation email to your Gaff address. You’ll find it under “Needs
            attention” on your lettings page, with the code to finish setting up.
          </p>
        </Notice>
        <p className={styles.hint}>
          Gaff matches each enquiry to a home using the Daft or MyHome advert links you added to the
          letting. Anything it can’t match waits for you, so nothing is missed.
        </p>
      </Card>
    </Stack>
  );
}
