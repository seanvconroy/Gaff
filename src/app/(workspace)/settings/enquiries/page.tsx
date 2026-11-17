import type { Metadata } from 'next';
import { forwardingCopy } from '@/copy/forwarding';
import { settingsCopy } from '@/copy/settings';
import { forwardingHref, forwardingInPlace } from '@/domain/enquiries/forwarding';
import { env } from '@/lib/env';
import { ButtonLink } from '@/ui/Button';
import { CopyButton } from '@/ui/CopyButton';
import { Narrow, PageHeader, Stack } from '@/ui/Layout';
import { loadSettings } from '../load';
import styles from '../settings.module.css';

export const metadata: Metadata = { title: 'Enquiries' };
export const dynamic = 'force-dynamic';

const copy = settingsCopy.enquiries;

/**
 * UX-ST-1, R5: the Gaff address enquiries are sent to, and the forwarding flow (UX-LT-17).
 * Whether forwarding works is known only from what has come through it (UX-LT-19).
 */
export default async function EnquiriesSettingsPage() {
  const { organisation } = await loadSettings();
  const address = `${organisation.inboundSlug}@${env().INBOUND_DOMAIN}`;
  const inPlace = forwardingInPlace({ worksAt: organisation.forwardingWorksAt });
  return (
    <Stack gap={8}>
      <PageHeader
        back={{ href: '/settings', label: settingsCopy.back }}
        title={copy.title}
        lead={copy.lead}
      />
      <Narrow>
        <Stack gap={6}>
          <section className={styles.subject} aria-labelledby="address-heading">
            <h2 id="address-heading" className="type-title">
              {copy.address}
            </h2>
            <div className={styles.address}>
              <code>{address}</code>
              <CopyButton value={address} what={copy.what} />
            </div>
            <p className={styles.description}>{copy.matching}</p>
          </section>
          <p>{inPlace ? forwardingCopy.settings.inPlace : forwardingCopy.settings.toDo}</p>
          <div>
            <ButtonLink href={forwardingHref()} variant="primary" fullWidth="phone">
              {inPlace ? forwardingCopy.settings.again : forwardingCopy.settings.start}
            </ButtonLink>
          </div>
        </Stack>
      </Narrow>
    </Stack>
  );
}
