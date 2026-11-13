import { describe, expect, it } from 'vitest';
import { isLikelyBot } from './views';

describe('Measurement: known bots aren’t counted', () => {
  it('counts people’s browsers', () => {
    expect(
      isLikelyBot(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false);
  });

  it('doesn’t count crawlers, link previews or scripts', () => {
    expect(
      isLikelyBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'),
    ).toBe(true);
    expect(isLikelyBot('facebookexternalhit/1.1')).toBe(true);
    expect(isLikelyBot('WhatsApp/2.23.20.0')).toBe(true);
    expect(isLikelyBot('curl/8.4.0')).toBe(true);
    expect(isLikelyBot('Mozilla/5.0 HeadlessChrome/120.0')).toBe(true);
    expect(isLikelyBot('')).toBe(true);
    expect(isLikelyBot(null)).toBe(true);
  });
});
