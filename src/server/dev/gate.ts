import { notFound } from 'next/navigation';
import { sendsRealEmail } from '@/adapters/email';
import { env } from '@/lib/env';
import { requireStaff } from '@/server/auth/staff';

/**
 * The outbox and test inbox (ADR-0010). Locally, where every email lands in the outbox, they're
 * open to whoever runs Gaff. On the test copy, which sends real email, the outbox holds only
 * made-up people's mail and the test inbox can write to any letting: testers (staff) only.
 */
export async function requireMailTools(): Promise<void> {
  const config = env();
  if (!config.DEV_TOOLS) notFound();
  if (sendsRealEmail(config)) await requireStaff();
}
