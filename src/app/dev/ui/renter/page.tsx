import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { env } from '@/lib/env';
import { BackLink, Narrow, PageHeader } from '@/ui/Layout';
import styles from '../ui.module.css';
import { pages } from './pages';

export const metadata: Metadata = { title: 'The renter’s pages' };
export const dynamic = 'force-dynamic';

/**
 * Development only (DEV_TOOLS=1): every page a renter or a tenant can see (work package WP-12),
 * each drawn from made-up details: `/dev/ui/renter?page=booked`. With no page named, the list of
 * them. A journey opens each at 390px and 1280px and holds it to the rules for every page
 * (tests/e2e/ux-rn-renter-pages.spec.ts).
 */
export default async function RenterPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  if (!env().DEV_TOOLS) notFound();
  const { page, q } = await searchParams;
  const chosen = page ? pages[page] : undefined;
  if (chosen) return chosen.render(q);
  return (
    <main className={styles.page}>
      <Narrow>
        <BackLink href="/dev/ui">Components</BackLink>
        <PageHeader
          title="The renter’s pages"
          lead="Every page a renter or a tenant can see, from made-up details. The buttons lead nowhere."
        />
        <ul className={styles.pageList}>
          {Object.entries(pages).map(([name, each]) => (
            <li key={name}>
              <Link href={`/dev/ui/renter?page=${name}`} className={styles.pageLink}>
                {each.label}
              </Link>
            </li>
          ))}
        </ul>
      </Narrow>
    </main>
  );
}
