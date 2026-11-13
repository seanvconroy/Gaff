'use server';

import { redirect } from 'next/navigation';
import { stopAlerts } from '@/server/alerts/searches';

/** M86: the "stop" link from an alert email, confirmed with one tap. */
export async function stopAlertsAction(token: string): Promise<void> {
  const result = await stopAlerts(token);
  redirect(`/alerts/stop/${encodeURIComponent(token)}?done=${result ? 1 : 0}`);
}
