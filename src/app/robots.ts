import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** M111: search engines may read the public pages, and nothing else. The test copy, nothing. */
export default function robots(): MetadataRoute.Robots {
  const config = env();
  if (!config.MARKETPLACE_PUBLIC || config.GAFF_ENV === 'staging') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: [
        '/to-rent',
        '/home/',
        '/development/',
        '/how-results-are-ordered',
        '/listing-policy',
        '/contact',
      ],
      disallow: '/',
    },
    sitemap: `${config.APP_URL}/sitemap.xml`,
  };
}
