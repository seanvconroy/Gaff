import { stopAlerts } from '@/server/alerts/searches';

/**
 * M86, RFC 8058: one-click unsubscribe. Mail apps POST "List-Unsubscribe=One-Click" here from
 * the alert's List-Unsubscribe header. No sign-in: the signed token is the permission.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await stopAlerts(decodeURIComponent(token));
  return new Response(null, { status: result ? 200 : 404 });
}
