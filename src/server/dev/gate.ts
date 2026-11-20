import { notFound } from 'next/navigation';
import { standInKeyMatches } from '@/adapters/checks/stand-in';
import { sendsRealEmail } from '@/adapters/email';
import { devToolsAccess, standInCheckAccess } from '@/domain/staff/dev-tools';
import { env } from '@/lib/env';
import { requireStaff } from '@/server/auth/staff';

/**
 * BA-1 (the live line's `requireMailTools`): every page and action under /dev that shows or
 * changes anything starts here. Off, it's "not found". Locally and in tests, where every email
 * is in the outbox, it's open to whoever runs Gaff. On the test copy, which sends real email,
 * it's for Gaff's own team only (STAFF_EMAILS), and everyone else gets "not found".
 */
export async function requireDevTools(): Promise<void> {
  const config = env();
  const access = devToolsAccess({ devTools: config.DEV_TOOLS, realEmail: sendsRealEmail(config) });
  if (access === 'nobody') notFound();
  if (access === 'staff') await requireStaff();
}

/**
 * BA-6: the stand-in ID and income check page (/dev/checks/<id>) and its action, the one
 * exception to the rule above. On the test copy, the person whose check it is opens it through
 * the link the stand-in sent them to (its key matches this check), so any tester can pass their
 * own check; without that key it's Gaff's team only, as for everything else under /dev. Off, it's
 * "not found" for everyone.
 */
export async function requireStandInCheck(
  checkId: string,
  key: string | null | undefined,
): Promise<void> {
  const config = env();
  const access = standInCheckAccess({
    devTools: config.DEV_TOOLS,
    realEmail: sendsRealEmail(config),
    ownLink: standInKeyMatches(checkId, key),
  });
  if (access === 'nobody') notFound();
  if (access === 'staff') await requireStaff();
}
