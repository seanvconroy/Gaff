import { notFound } from 'next/navigation';
import { sendsRealEmail } from '@/adapters/email';
import { devToolsAccess } from '@/domain/staff/dev-tools';
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
