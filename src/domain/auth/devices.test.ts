import { describe, expect, it } from 'vitest';
import { describeDevice } from './devices';

const agents = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
  firefoxWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  chromeIpad:
    'Mozilla/5.0 (iPad; CPU OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
};

describe('AU8: naming a signed-in device', () => {
  it('names the browser and what it runs on', () => {
    expect(describeDevice(agents.chromeMac)).toBe('Chrome on a Mac');
    expect(describeDevice(agents.safariIphone)).toBe('Safari on an iPhone');
    expect(describeDevice(agents.safariMac)).toBe('Safari on a Mac');
    expect(describeDevice(agents.edgeWindows)).toBe('Edge on Windows');
    expect(describeDevice(agents.firefoxWindows)).toBe('Firefox on Windows');
    expect(describeDevice(agents.chromeAndroid)).toBe('Chrome on an Android phone');
    expect(describeDevice(agents.chromeIpad)).toBe('Chrome on an iPad');
    expect(describeDevice(agents.firefoxLinux)).toBe('Firefox on Linux');
  });

  it('says what it can when it only knows half, and never shows the raw text', () => {
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0) Something/1.0')).toBe(
      'A browser on Windows',
    );
    expect(describeDevice('curl/8.5.0')).toBe('A browser or app');
    expect(describeDevice(null)).toBe('A browser or app');
    expect(describeDevice('')).toBe('A browser or app');
  });
});
