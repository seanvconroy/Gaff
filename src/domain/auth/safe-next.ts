/**
 * AU3: where to go after signing in. Only a path on Gaff itself, never another site. A search's
 * filters may come too (M86), but nothing that could name a scheme or another host.
 */
export function safeNext(value: unknown, fallback = '/'): string {
  const next = typeof value === 'string' ? value : '';
  return /^\/(?![/\\])[A-Za-z0-9/_.~,=&?%-]*$/.test(next) ? next : fallback;
}
