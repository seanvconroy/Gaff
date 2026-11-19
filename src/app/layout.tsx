import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/tokens.css';
import '@/styles/fonts.css';
import '@/styles/base.css';
import { isTestCopy, TestCopyBanner } from '@/ui/TestCopyBanner';

export const metadata: Metadata = {
  title: { default: 'Gaff', template: '%s · Gaff' },
  description: 'Lettings, from first enquiry to signed tenancy.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // UX-NV-4: lets the tab bar's safe-area padding take effect on phones with a home indicator.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IE">
      <head>
        <link
          rel="preload"
          href="/fonts/dm-sans-latin-opsz-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        {/* BA-1: the test copy says so on every page. Read from the process, as the build sees it. */}
        {isTestCopy(process.env.GAFF_ENV) ? <TestCopyBanner /> : null}
        {children}
      </body>
    </html>
  );
}
