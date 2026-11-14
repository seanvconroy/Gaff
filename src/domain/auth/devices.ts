/**
 * AU8: a signed-in device in words, such as "Safari on an iPhone", so someone can recognise
 * their own devices. Read from the browser's own description of itself; the raw text is never
 * shown.
 */

function browser(agent: string): string | null {
  // Order matters: Edge and Chrome on iOS also say "Safari", and Edge also says "Chrome".
  if (/\bEdg(e|A|iOS)?\//.test(agent)) return 'Edge';
  if (/\b(Firefox|FxiOS)\//.test(agent)) return 'Firefox';
  if (/\b(Chrome|CriOS)\//.test(agent)) return 'Chrome';
  if (/\bSafari\//.test(agent) && /\bVersion\//.test(agent)) return 'Safari';
  return null;
}

function system(agent: string): string | null {
  if (/\biPhone\b/.test(agent)) return 'an iPhone';
  if (/\biPad\b/.test(agent)) return 'an iPad';
  if (/\bAndroid\b/.test(agent))
    return /\bMobile\b/.test(agent) ? 'an Android phone' : 'an Android tablet';
  if (/\bMacintosh\b/.test(agent)) return 'a Mac';
  if (/\bWindows\b/.test(agent)) return 'Windows';
  if (/\bCrOS\b/.test(agent)) return 'a Chromebook';
  if (/\bLinux\b/.test(agent)) return 'Linux';
  return null;
}

export function describeDevice(userAgent: string | null | undefined): string {
  const agent = userAgent ?? '';
  const name = browser(agent);
  const on = system(agent);
  if (name && on) return `${name} on ${on}`;
  if (on) return `A browser on ${on}`;
  if (name) return name;
  return 'A browser or app';
}
