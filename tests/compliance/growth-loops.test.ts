import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { frameCopy } from '@/copy/frame';
import { messages } from '@/db/schema';
import { frameFooter, frameHeader, letBy, type Lister } from '@/domain/frame/frame';

/**
 * The growth loops' rules (section 9 of the UX redesign, "Growth loops"; Q45, rule 9), held by
 * reading the code itself, so a new path that breaks one fails here.
 */

const root = join(__dirname, '..', '..');
const src = join(root, 'src');

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesIn(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The code without its comments: what a comment says is never shown to anyone. */
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const code = filesIn(src).map((path) => ({
  path: relative(root, path),
  text: withoutComments(readFileSync(path, 'utf8')),
}));

const lister: Lister = {
  name: 'Halcyon Lettings',
  licence: '001234',
  phone: null,
  slug: 'halcyon',
};

describe('UX-GR-7: Gaff isn’t white-label', () => {
  it('a renter’s page carries Gaff’s wordmark with the lister’s name, and no "Run with Gaff"', () => {
    expect(frameHeader('renter', lister)).toMatchObject({ brand: 'wordmark' });
    expect(letBy('renter', lister)).toBe('Halcyon Lettings');
    expect(frameFooter('renter', lister).runWithGaff).toBe(false);
  });

  it('an owner’s and a referee’s pages carry the agency’s name, with "Run with Gaff" in the footer', () => {
    for (const audience of ['owner', 'referee'] as const) {
      expect(frameHeader(audience, lister)).toMatchObject({
        brand: 'lister',
        name: 'Halcyon Lettings',
      });
      expect(frameFooter(audience, lister).runWithGaff).toBe(true);
    }
  });

  it('says "Run with Gaff" in one place, used only by the private pages’ frame and its emails', () => {
    expect(frameCopy.runWithGaff).toBe('Run with Gaff');
    // Said in words a page or an email shows: in quotes or between tags, not in a comment.
    const said = code
      .filter((file) => /['"`>]Run with Gaff['"`<]/.test(file.text))
      .map((file) => file.path);
    expect(said).toEqual(['src/copy/frame.ts']);
    const used = code
      .filter((file) => file.text.includes('frameCopy.runWithGaff'))
      .map((file) => file.path)
      .sort();
    expect(used).toEqual(['src/copy/email-layout.ts', 'src/ui/PrivateFrame.tsx']);
  });
});

describe('UX-GR-8: nothing on a referee’s or an owner’s page promotes Gaff beyond that line', () => {
  const pages = code.filter((file) => /^src\/app\/(approve|l|reference)\//.test(file.path));

  it('finds the owner’s and the referee’s pages', () => {
    expect(pages.map((page) => page.path.split('/')[2])).toEqual(
      expect.arrayContaining(['approve', 'l', 'reference']),
    );
  });

  it('links to no part of Gaff a person signs up from, and shows no prompt', () => {
    for (const page of pages) {
      expect(page.text, page.path).not.toMatch(
        /href=["'{`]+\/(sign-in|welcome|lettings\/new|homes|saved)?["'`?]/,
      );
      expect(page.text, page.path).not.toMatch(/promptFor|PromptLine|@\/ui\/Prompt\b/);
      expect(page.text, page.path).not.toMatch(/\b(sign up|try gaff|use gaff|let it yourself)\b/i);
    }
  });
});

describe('UX-GR-9: no loop uses a renter’s, owner’s or referee’s contact details for anything else', () => {
  /**
   * Every place that sends an email or a text, and who it goes to. A new sender must be added
   * here with its reason, so nobody's details are used for something they didn't ask for.
   */
  const senders: Record<string, string> = {
    // Every message about a letting: to the renter, the owner or a referee of that letting. Each
    // message belongs to one letting (`messages.letting_id` is required).
    'src/server/messages/outbox.ts': 'the letting a person is part of',
    // UX-AV-6: confirming an enquiry the renter made on Gaff, to the address they gave for it.
    'src/server/enquiries/ask-to-view.ts': 'the enquiry the renter just made',
    // Sign-in codes: to the person signing in, who asked for one.
    'src/server/auth/codes.ts': 'the person’s own sign-in',
    // Account emails: invites and team news to members, a renter's own kept profile.
    'src/server/accounts/emails.ts': 'the person’s own account or team',
    // UX-SR-10: a saved search's confirmation and alerts, to an address that opted in.
    'src/server/saved/emails.ts': 'a search the person asked to be told about',
    // UX-LT-19: the test enquiry, to the member setting up forwarding.
    'src/server/enquiries/forwarding.ts': 'the member’s own mailbox',
    // R24: the RTB reminder, to the organisation's admins.
    'src/server/tenancy/rtb.ts': 'the organisation’s admins',
    // P4: the AI budget warning, to Gaff's own team (STAFF_EMAILS) and nobody else.
    'src/server/ai/usage.ts': 'Gaff’s own team',
  };

  it('sends only from the places listed, each for its own reason', () => {
    const sending = code
      .filter((file) => !file.path.startsWith('src/adapters/'))
      .filter((file) => /\b(emailSender|smsSender)\(\)\s*\.send\(|\.send\(\{/.test(file.text))
      .filter((file) => /\b(emailSender|smsSender)\(\)/.test(file.text))
      .map((file) => file.path)
      .sort();
    expect(sending).toEqual(Object.keys(senders).sort());
  });

  it('keeps every message to a renter, owner or referee on the letting it is about', () => {
    const lettingId = getTableConfig(messages).columns.find((c) =>
      ['letting_id', 'lettingId'].includes(c.name),
    );
    expect(lettingId?.notNull).toBe(true);
  });

  it('builds no prompt or loop on a renter’s, owner’s or referee’s address', () => {
    for (const file of code.filter((f) =>
      /^src\/(server\/activation|domain\/activation)\//.test(f.path),
    )) {
      expect(file.text, file.path).not.toMatch(/\b(email|phone|fullName|landlordEmail)\b\s*[:,)]/);
      expect(file.text, file.path).not.toMatch(/emailSender|smsSender|enqueue\(/);
    }
  });

  it('sends saved-search alerts only to a search whose address was confirmed', () => {
    const alerts = code.find((file) => file.path === 'src/server/saved/alerts.ts');
    const saved = alerts ?? code.find((file) => file.path === 'src/server/saved/searches.ts');
    expect(saved?.text).toMatch(/confirmedAt/);
  });
});
