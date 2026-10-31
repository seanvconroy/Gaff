import type { Metadata } from 'next';
import Link from 'next/link';
import { stageLabels } from '@/domain/lettings/stages';
import { formatDate, formatRent } from '@/lib/format';
import { requireMember } from '@/server/auth/member';
import { listLettings } from '@/server/lettings/queries';
import { ButtonLink } from '@/ui/Button';
import { Card, PageHeader, Stack } from '@/ui/Layout';
import { StatusPill } from '@/ui/StatusPill';
import styles from './dashboard.module.css';

export const metadata: Metadata = { title: 'Lettings' };

export default async function DashboardPage() {
  const member = await requireMember();
  const lettings = await listLettings(member);
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={member.organisationName}
        title="Your lettings"
        actions={
          <ButtonLink href="/lettings/new" variant="primary">
            Add a letting
          </ButtonLink>
        }
      />
      {lettings.length === 0 ? (
        <Card>
          <h2 className="type-title">No lettings yet</h2>
          <p>
            Add a home you&apos;re letting. It takes about ten minutes: the address, rent, key facts
            and viewing times. Then Gaff answers every enquiry for you.
          </p>
        </Card>
      ) : (
        <ul className={styles.list}>
          {lettings.map((letting) => (
            <li key={letting.id} className={styles.item}>
              <div className={styles.text}>
                <Link href={`/lettings/${letting.id}`} className={`${styles.address} type-title`}>
                  {letting.addressLine1}
                </Link>
                <span className={styles.meta}>
                  {letting.area} · {formatRent(letting.monthlyRentCents)} · Available from{' '}
                  {formatDate(letting.availableFrom)}
                </span>
              </div>
              <StatusPill tone={letting.status === 'live' ? 'success' : 'neutral'}>
                {stageLabels[letting.stage]}
              </StatusPill>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
