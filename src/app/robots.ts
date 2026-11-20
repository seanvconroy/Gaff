import type { MetadataRoute } from 'next';
import { withPlatformDefaults } from '@/lib/env';
import { robotsFor } from '@/lib/robots';

export const dynamic = 'force-dynamic';

/**
 * BA-1: robots.txt disallows everything unless SEARCH_INDEXING=on. Read straight from the
 * process, like next.config.ts, so it answers even before the rest of the settings are checked.
 * M111 (BA-12): where it is on, it points at the sitemap, at the deployment's own address.
 */
export default function robots(): MetadataRoute.Robots {
  const on = process.env.SEARCH_INDEXING === 'on';
  return robotsFor(on ? 'on' : 'off', on ? withPlatformDefaults(process.env).APP_URL : undefined);
}
