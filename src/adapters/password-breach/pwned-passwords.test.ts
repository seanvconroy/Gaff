import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { pwnedPasswords } from './pwned-passwords';
import { standInBreachCheck } from './stand-in';

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex').toUpperCase();

/** A stand-in for the range API: answers with these hash suffixes and counts. */
function rangeApi(lines: string[]) {
  return vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(lines.join('\r\n'), { status: 200 }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('AU12: refusing passwords seen in data breaches', () => {
  const password = 'the bins go out on tuesday';
  const hash = sha1(password);

  it('sends only the first 5 characters of the hash, never the password', async () => {
    const api = rangeApi([`${hash.slice(5)}:3`]);
    expect(await pwnedPasswords(api).isBreached(password)).toBe(true);
    expect(api).toHaveBeenCalledTimes(1);
    const [url, init] = api.mock.calls[0]!;
    expect(String(url)).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(String(url)).not.toContain(hash.slice(5));
    expect(JSON.stringify(init)).not.toContain(password);
    expect((init!.headers as Record<string, string>)['Add-Padding']).toBe('true');
  });

  it('finds the rest of the hash among the answers, whatever their case', async () => {
    const others = [
      '0018A45C4D1DEF81644B54AB7F969B88D65:1',
      '00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2',
    ];
    expect(
      await pwnedPasswords(rangeApi([...others, `${hash.slice(5).toLowerCase()}:12`])).isBreached(
        password,
      ),
    ).toBe(true);
    expect(await pwnedPasswords(rangeApi(others)).isBreached(password)).toBe(false);
  });

  it('ignores padding, which has the hash’s shape and a count of 0', async () => {
    expect(await pwnedPasswords(rangeApi([`${hash.slice(5)}:0`])).isBreached(password)).toBe(false);
  });

  it('lets the password through when the service is down or slow, and never throws', async () => {
    const down = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    expect(await pwnedPasswords(down).isBreached(password)).toBe(false);
    const broken = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(await pwnedPasswords(broken).isBreached(password)).toBe(false);
    const slow = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    ) as unknown as typeof fetch;
    expect(await pwnedPasswords(slow, 20).isBreached(password)).toBe(false);
  });

  it('has a stand-in for development and tests that asks nobody', async () => {
    expect(await standInBreachCheck.isBreached('password1234')).toBe(true);
    expect(await standInBreachCheck.isBreached('Password1234')).toBe(true);
    expect(await standInBreachCheck.isBreached(password)).toBe(false);
  });
});
