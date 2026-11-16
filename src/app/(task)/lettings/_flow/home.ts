import { notFound, redirect } from 'next/navigation';
import { stoppedByConflict } from '@/server/accounts/conflict';
import { requireMember } from '@/server/auth/member';
import { type FlowHome, loadHome } from '@/server/lettings/drafts';

/**
 * The home a screen of the flow is about: a draft or a letting, by the one ID it keeps from
 * its first answer to going live. "Not found" for anything that isn't this organisation's, and
 * a member who applied for the home themselves is turned away, as on its own page (UX-AC-14).
 */
export async function flowHome(id: string): Promise<{
  member: Awaited<ReturnType<typeof requireMember>>;
  home: FlowHome;
}> {
  const member = await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const home = await loadHome(member, id);
  if (!home) notFound();
  if (home.kind === 'letting' && (await stoppedByConflict(member, id))) {
    redirect('/lettings/yours');
  }
  return { member, home };
}
