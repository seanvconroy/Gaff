import type { MetadataRoute } from 'next';
import { robotsFor } from '@/lib/robots';

export const dynamic = 'force-dynamic';

/**
 * BA-1: robots.txt disallows everything unless SEARCH_INDEXING=on. Read straight from the
 * process, like next.config.ts, so it answers even before the rest of the settings are checked.
 */
export default function robots(): MetadataRoute.Robots {
  return robotsFor(process.env.SEARCH_INDEXING === 'on' ? 'on' : 'off');
}
