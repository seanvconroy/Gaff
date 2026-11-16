import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { emailCopy, emailStyle, emailWordmark, layOutEmail } from '@/copy/email-layout';
import { listerFrom } from '@/domain/frame/frame';
import { emailAudience } from '@/domain/messages/email';
import { findProtectedGrounds } from '@/domain/compliance/protected-grounds';
import {
  APP,
  MESSAGES_WRITTEN_AT,
  writtenMessages,
  type WrittenMessage,
} from '../fixtures/messages';

/**
 * UX-PP-10, UX-AI-10 (product rules 6 and 7): every email to a renter, an owner or a referee is
 * sent in one layout, and the layout changes how a message looks, never what it says. These
 * tests lay out every message Gaff writes and hold the result to that.
 */

const CONFIRMED = new Date('2026-11-01T10:00:00Z');
const agency = listerFrom({
  name: 'Halcyon Lettings',
  kind: 'agency',
  psraLicenceNumber: '001234',
  confirmedAt: CONFIRMED,
  inboundSlug: 'halcyon-lettings',
});
const landlord = listerFrom({
  name: 'Mary Byrne',
  kind: 'landlord',
  psraLicenceNumber: null,
  confirmedAt: null,
  inboundSlug: 'mary-byrne',
});

const laidOut = (message: WrittenMessage, lister = agency) =>
  layOutEmail({ ...message, lister, appUrl: APP });

const entities: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/** What a reader sees of a piece of the email: its words, with the layout taken away. */
function visibleText(html: string): string {
  return html
    .replace(/<br>/g, '\n')
    .replace(/<li[^>]*>/g, '- ')
    .replace(/<\/(p|li|ul|table)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (entity) => entities[entity]!)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');
}

/** The message's own words, between the layout's two marks. */
function wordsOf(html: string): string {
  const [, words] = /<!--words-->([\s\S]*)<!--\/words-->/.exec(html) ?? [];
  if (words === undefined) throw new Error('The layout has lost its words');
  return words;
}

function anchors(html: string): Array<{ href: string; text: string; button: boolean }> {
  return [...html.matchAll(/<a\s([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, inner]) => ({
    href: /href="([^"]*)"/.exec(attributes!)?.[1]?.replace(/&amp;/g, '&') ?? '',
    text: visibleText(inner!),
    button: attributes!.includes('data-email="button"'),
  }));
}

describe('Compliance: the layout of every email', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MESSAGES_WRITTEN_AT);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('UX-AI-10: the plain-text alternative is the message exactly as it was written', () => {
    for (const message of writtenMessages()) {
      expect(laidOut(message).text, message.name).toBe(message.body);
    }
  });

  it('UX-AI-10: the laid-out email says every word of the message, in order, and no others', () => {
    for (const message of writtenMessages()) {
      // The only difference a reader sees: each web address is a button or a link with a label.
      let expected = message.body;
      for (const anchor of anchors(wordsOf(laidOut(message).html))) {
        expect(expected, `${message.name}: ${anchor.href}`).toContain(anchor.href);
        expected = expected.replace(`${anchor.text}: ${anchor.href}`, anchor.text);
        expected = expected.replace(anchor.href, anchor.text);
      }
      expected = expected
        .split('\n')
        .filter((line) => line.trim() !== '')
        .join('\n');
      expect(visibleText(wordsOf(laidOut(message).html)), message.name).toBe(expected);
    }
  });

  it('UX-PP-10: no email shows a bare web address as a link’s words, or anywhere else', () => {
    for (const message of writtenMessages()) {
      const { html } = laidOut(message);
      for (const anchor of anchors(html)) {
        expect(anchor.text, `${message.name}: ${anchor.href}`).not.toMatch(/:\/\/|^www\./);
        expect(anchor.text.trim(), message.name).not.toBe('');
      }
      expect(visibleText(html.replace(/<title>[\s\S]*<\/title>/, '')), message.name).not.toMatch(
        /https?:\/\//,
      );
    }
  });

  it('UX-PP-10: every link the message carries is still there to press', () => {
    for (const message of writtenMessages()) {
      const hrefs = anchors(laidOut(message).html).map((anchor) => anchor.href);
      for (const url of message.body.match(/https?:\/\/\S+/g) ?? []) {
        expect(hrefs, message.name).toContain(url);
      }
    }
  });

  it('UX-PP-10: one purpose: a message with a link has one button, with a label of its own', () => {
    for (const message of writtenMessages()) {
      const buttons = anchors(laidOut(message).html).filter((anchor) => anchor.button);
      if (message.link) {
        expect(buttons, message.name).toHaveLength(1);
        expect(buttons[0]!.href, message.name).toBe(message.link);
        expect(buttons[0]!.text, message.name).toBe(emailCopy.button[message.kind]);
      } else {
        expect(buttons, message.name).toHaveLength(0);
      }
    }
  });

  it('UX-PP-10: every kind of message that carries a link has a label for its button', () => {
    const kinds = new Set(
      writtenMessages()
        .filter((message) => message.link)
        .map((message) => message.kind),
    );
    expect([...kinds].sort()).toEqual(Object.keys(emailCopy.button).sort());
    for (const label of [...Object.values(emailCopy.button), emailCopy.openPage]) {
      expect(label).not.toMatch(/[!]|click|here/i);
      expect(findProtectedGrounds(label)).toEqual([]);
    }
  });

  it('UX-PP-10: the button is 48px high, and nothing is set smaller than 16px', () => {
    // 12px above and below one 24px line.
    expect(emailStyle.buttonPadding).toBe('12px 24px');
    expect(emailStyle.line).toBe('24px');
    for (const message of writtenMessages()) {
      const sizes = [...laidOut(message).html.matchAll(/font-size:(\d+)px/g)].map(([, size]) =>
        Number(size),
      );
      expect(sizes.length, message.name).toBeGreaterThan(0);
      expect(Math.min(...sizes), message.name).toBeGreaterThanOrEqual(16);
    }
  });

  it('rule 6, UX-AI-1: the first message still says the renter is dealing with an AI assistant', () => {
    for (const message of writtenMessages().filter((m) => m.kind === 'first_reply')) {
      const seen = visibleText(wordsOf(laidOut(message).html));
      expect(seen).toContain('I’m Halcyon Lettings’ AI assistant.');
      expect(seen).toContain('a person at Halcyon Lettings makes every decision');
      expect(seen).toContain('If you’d rather talk to a person, just reply and say so.');
      expect(laidOut(message).text).toContain('I’m Halcyon Lettings’ AI assistant.');
    }
  });

  it('UX-AI-1: what the assistant wrote is marked as the assistant’s, and nothing else is', () => {
    for (const message of writtenMessages()) {
      const { html } = laidOut(message);
      if (message.author === 'ai') {
        expect(visibleText(html), message.name).toContain('From Halcyon Lettings’ AI assistant');
      } else {
        expect(html, message.name).not.toContain('data-email="assistant"');
      }
    }
  });

  it('UX-AI-2: every email to a renter says how to reach a person', () => {
    for (const message of writtenMessages()) {
      if (emailAudience(message.kind) !== 'renter') continue;
      expect(visibleText(laidOut(message).html), message.name).toContain(
        'Want to talk to a person? Reply to this email and say so.',
      );
    }
  });

  it('UX-PP-10: a renter’s email carries the wordmark, as a picture with its name', () => {
    for (const message of writtenMessages()) {
      if (emailAudience(message.kind) !== 'renter') continue;
      const { html } = laidOut(message);
      expect(html, message.name).toContain(
        `<img src="${APP}/email/wordmark.png" width="46" height="27" alt="Gaff"`,
      );
      expect(visibleText(html), message.name).not.toContain('Run with Gaff');
    }
  });

  it('UX-PP-9: an owner’s or a referee’s email carries the agency’s name, and never invites them to Gaff', () => {
    const others = writtenMessages().filter((m) => emailAudience(m.kind) !== 'renter');
    expect(others.map((m) => m.kind)).toEqual(
      expect.arrayContaining(['landlord_approval', 'reference_request', 'reference_reminder']),
    );
    for (const message of others) {
      const { html } = laidOut(message);
      const [, top] = /data-email="header"[^>]*>([\s\S]*?)<\/td>/.exec(html) ?? [];
      expect(visibleText(top ?? ''), message.name).toBe('Halcyon Lettings');
      expect(html, message.name).not.toContain('<img');
      const foot = visibleText(/data-email="footer"[^>]*>([\s\S]*?)<\/td>/.exec(html)?.[1] ?? '');
      expect(foot, message.name).toBe(
        'To reach Halcyon Lettings, reply to this email.\nHalcyon Lettings · PSRA licence 001234\nRun with Gaff',
      );
      // What the layout adds round the message never asks them to use Gaff (Q45).
      expect(`${top}\n${foot}`, message.name).not.toMatch(/sign up|try|get gaff|join|account/i);
      // The privacy notice is written for renters.
      expect(html, message.name).not.toContain('/privacy/');
    }
  });

  it('UX-PP-1: the footer names the lister, with its PSRA licence only where it has one', () => {
    const [invitation] = writtenMessages().filter((m) => m.kind === 'invitation');
    const foot = (html: string) =>
      visibleText(/data-email="footer"[^>]*>([\s\S]*?)<\/td>/.exec(html)?.[1] ?? '');
    expect(foot(laidOut(invitation!).html)).toBe(
      'Want to talk to a person? Reply to this email and say so.\nHalcyon Lettings · PSRA licence 001234\nHow we use your details',
    );
    expect(foot(laidOut(invitation!, landlord).html)).toBe(
      'Want to talk to a person? Reply to this email and say so.\nMary Byrne\nHow we use your details',
    );
  });

  it('UX-PP-10: the privacy notice is linked once: in the first reply’s own words, or the footer', () => {
    for (const message of writtenMessages()) {
      if (emailAudience(message.kind) !== 'renter') continue;
      const links = anchors(laidOut(message).html).filter((a) => a.href.includes('/privacy/'));
      expect(links, message.name).toHaveLength(1);
      expect(links[0], message.name).toEqual({
        href: `${APP}/privacy/halcyon-lettings`,
        text: 'How we use your details',
        button: false,
      });
    }
  });

  it('UX-PP-6: the layout adds no line of caution', () => {
    const added = [
      emailCopy.talkToAPerson,
      emailCopy.reachLister('Halcyon Lettings', '01 496 0000'),
    ];
    for (const line of added) {
      expect(line).not.toMatch(/please note|disclaimer|confidential|liab|at your own risk|never/i);
      expect(line).not.toContain('!');
    }
  });

  it('a message’s words can’t break out of the layout', () => {
    const { html } = layOutEmail({
      kind: 'operator_answer',
      author: 'person',
      subject: 'Re: <script>alert(1)</script>',
      body: 'Hello,\n\n<b onclick="x()">Bold</b> & "quoted"\nhttps://app.gaff.test/r/a"onmouseover="x',
      lister: agency,
      appUrl: APP,
    });
    expect(html).not.toMatch(/<script|<b |onclick="x|onmouseover="x/);
    expect(html).toContain(
      '&lt;b onclick=&quot;x()&quot;&gt;Bold&lt;/b&gt; &amp; &quot;quoted&quot;',
    );
  });

  it('the layout’s colours and type are the light theme’s tokens', () => {
    const tokens = JSON.parse(readFileSync('docs/design-tokens.json', 'utf8')) as {
      color: { tokens: Array<{ name: string; value: { light: string } }> };
      radius: { tokens: Array<{ name: string; value: string }> };
      type: {
        groups: Array<{ styles: Array<{ name: string; fontSize: string; lineHeight: string }> }>;
      };
    };
    const colour = (name: string): string => {
      const value = tokens.color.tokens.find((t) => t.name === name)!.value.light;
      return value.startsWith('{') ? colour(value.slice(1, -1)) : value;
    };
    expect({
      surface: emailStyle.surface,
      quiet: emailStyle.quiet,
      ink: emailStyle.ink,
      inkMuted: emailStyle.inkMuted,
      inkInverse: emailStyle.inkInverse,
      border: emailStyle.border,
      link: emailStyle.link,
      ai: emailStyle.ai,
      aiBg: emailStyle.aiBg,
    }).toEqual({
      surface: colour('surface-0'),
      quiet: colour('surface-2'),
      ink: colour('primary'),
      inkMuted: colour('ink-muted'),
      inkInverse: colour('ink-inverse'),
      border: colour('border'),
      link: colour('brand-text'),
      ai: colour('ai'),
      aiBg: colour('ai-bg'),
    });
    expect(emailStyle.radius).toBe(tokens.radius.tokens.find((t) => t.name === 'radius-md')!.value);
    const body = tokens.type.groups[0]!.styles.find((style) => style.name === 'body')!;
    expect([emailStyle.size, emailStyle.line]).toEqual([body.fontSize, body.lineHeight]);
  });

  it('UX-DS-22: the wordmark’s picture is drawn at twice the size it is shown at', () => {
    const png = readFileSync(`public${emailWordmark.path}`);
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    // A PNG's size is the first thing in it: two 32-bit numbers, 16 bytes in.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
      emailWordmark.width * 2,
      emailWordmark.height * 2,
    ]);
  });
});
