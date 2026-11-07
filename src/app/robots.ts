import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** M111: search engines may read the public pages, and nothing else. */
export default function robots(): MetadataRoute.Robots {
  const config = env();
  if (!config.MARKETPLACE_PUBLIC) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: ['/to-rent', '/home/', '/how-results-are-ordered', '/listing-policy', '/contact'],
      disallow: '/',
    },
    sitemap: `${config.APP_URL}/sitemap.xml`,
  };
}
