import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { organisations } from '@/db/schema';
import { requireMember } from '@/server/auth/member';

/** Settings belong to the organisation the member lets for (UX-ST-1). */
export async function loadSettings() {
  const member = await requireMember();
  const [organisation] = await db()
    .select()
    .from(organisations)
    .where(eq(organisations.id, member.organisationId));
  return { member, organisation: organisation! };
}

/**
 * A settings page with a form to save: admins only (section 4's table). An agent who isn't an
 * admin never sees a form they can't save; they go back to the list of rows.
 */
export async function loadSettingsPage() {
  const loaded = await loadSettings();
  if (loaded.member.role !== 'admin') redirect('/settings');
  return loaded;
}
