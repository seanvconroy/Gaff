import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/tokens.css';
import '@/styles/fonts.css';
import '@/styles/base.css';
import { TestCopyBanner } from '@/ui/TestCopyBanner';

export const metadata: Metadata = {
  title: { default: 'Gaff', template: '%s · Gaff' },
  description: 'Lettings, from first enquiry to signed tenancy.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IE">
      <head>
        <link
          rel="preload"
          href="/fonts/dm-sans-latin-wght-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/fraunces-latin-wght-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        {process.env.GAFF_ENV === 'staging' ? <TestCopyBanner /> : null}
        {children}
      </body>
    </html>
  );
}
