import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { emailWordmark } from '../../src/copy/email-layout';
import { wordmarkFullStop, wordmarkLetters, wordmarkSize } from '../../src/ui/wordmarkPaths';

/**
 * Draws the wordmark as a picture for emails (UX-PP-10, UX-DS-22). An email can't carry the
 * drawing itself: most mail apps strip inline SVG. So the same outlines are drawn once, here, as
 * a PNG at twice the size it is shown at, on white so it reads in a mail app's dark mode too.
 *
 * It is run by hand, and again only if the lettering or the brand colour changes:
 *
 *     pnpm exec tsx scripts/wordmark/email-png.ts
 *
 * The size it writes is pinned by tests/compliance/email-layout.test.ts.
 */
const tokens = JSON.parse(readFileSync('docs/design-tokens.json', 'utf8')) as {
  color: { tokens: Array<{ name: string; value: { light: string } }> };
};

const colour = (name: string) => {
  const token = tokens.color.tokens.find((t) => t.name === name);
  if (!token) throw new Error(`No colour token ${name}`);
  return token.value.light;
};

async function main() {
  const { width, height } = emailWordmark;
  const file = `public${emailWordmark.path}`;
  // The drawing is as tall as the picture, and starts at its left edge.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
    viewBox="0 0 ${wordmarkSize.width} ${wordmarkSize.height}" preserveAspectRatio="xMinYMid meet">
    <path fill="${colour('ink')}" d="${wordmarkLetters}"/>
    <path fill="${colour('brand')}" d="${wordmarkFullStop}"/>
  </svg>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.setContent(
    `<body style="margin:0;background:${colour('surface-0')}">${svg.replace('<svg', '<svg style="display:block"')}</body>`,
  );
  const png = await page.screenshot({ clip: { x: 0, y: 0, width, height } });
  await browser.close();
  mkdirSync('public/email', { recursive: true });
  writeFileSync(file, png);
  console.log(`Wrote ${file}: ${width * 2} by ${height * 2}px`);
}

void main();
