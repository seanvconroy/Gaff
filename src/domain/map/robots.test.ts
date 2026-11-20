import { describe, expect, it } from 'vitest';
import { isLikelyBot } from './robots';

describe('M132: no map for robots', () => {
  it('knows search engines, link previews and scripts', () => {
    for (const agent of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'facebookexternalhit/1.1',
      'WhatsApp/2.23.20.0',
      'curl/8.4.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0 Safari/537.36',
      '',
      null,
    ]) {
      expect(isLikelyBot(agent), String(agent)).toBe(true);
    }
  });

  it('lets a renter’s browser have the map', () => {
    expect(
      isLikelyBot(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false);
    expect(
      isLikelyBot(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ),
    ).toBe(false);
  });
});
