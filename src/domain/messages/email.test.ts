import { describe, expect, it } from 'vitest';
import { buttonLink, emailAudience, emailBlocks, inlineParts, siteName } from './email';

const APP = 'https://app.gaff.test';

describe('the email layout: who a message is written to', () => {
  it('UX-PP-9: the approval request is the owner’s, and a reference request the referee’s', () => {
    expect(emailAudience('landlord_approval')).toBe('owner');
    expect(emailAudience('reference_request')).toBe('referee');
    expect(emailAudience('reference_reminder')).toBe('referee');
  });

  it('UX-PP-10: every other message is a renter’s', () => {
    for (const kind of ['first_reply', 'answer', 'invitation', 'offer', 'outcome', 'reminder']) {
      expect(emailAudience(kind)).toBe('renter');
    }
  });
});

describe('the email layout: reading a message’s text', () => {
  it('UX-PP-10: a web address on a line of its own is the message’s link', () => {
    expect(
      emailBlocks(`Hello Aoife,\n\nBook a time that suits you here:\n${APP}/r/token\n\nHalcyon`),
    ).toEqual([
      { type: 'words', lines: [[{ type: 'text', text: 'Hello Aoife,' }]] },
      { type: 'words', lines: [[{ type: 'text', text: 'Book a time that suits you here:' }]] },
      { type: 'link', url: `${APP}/r/token` },
      { type: 'words', lines: [[{ type: 'text', text: 'Halcyon' }]] },
    ]);
  });

  it('UX-PP-10: words that name a web address become the link’s label', () => {
    expect(emailBlocks(`How we use your details: ${APP}/privacy/halcyon`)).toEqual([
      { type: 'named-link', label: 'How we use your details', url: `${APP}/privacy/halcyon` },
    ]);
  });

  it('UX-AI-10: a list stays a list, under the line that introduces it', () => {
    expect(emailBlocks('Viewing times:\n- Saturday 7 November, 6pm\n- Monday 9 November')).toEqual([
      { type: 'words', lines: [[{ type: 'text', text: 'Viewing times:' }]] },
      {
        type: 'list',
        items: [
          [{ type: 'text', text: 'Saturday 7 November, 6pm' }],
          [{ type: 'text', text: 'Monday 9 November' }],
        ],
      },
    ]);
  });

  it('UX-AI-10: lines written one under another stay on their own lines', () => {
    expect(emailBlocks('You asked: Is there parking?\nYes, one space.')).toEqual([
      {
        type: 'words',
        lines: [
          [{ type: 'text', text: 'You asked: Is there parking?' }],
          [{ type: 'text', text: 'Yes, one space.' }],
        ],
      },
    ]);
  });

  it('UX-PP-10: a web address inside a sentence is found, without the full stop after it', () => {
    expect(inlineParts('The advert is at https://www.daft.ie/for-rent/123. See you then.')).toEqual(
      [
        { type: 'text', text: 'The advert is at ' },
        { type: 'address', url: 'https://www.daft.ie/for-rent/123' },
        { type: 'text', text: '. See you then.' },
      ],
    );
  });

  it('UX-AI-10: nothing is lost: every word of the text is in a block', () => {
    const body =
      'Hello,\n\nOne: two.\nThree https://x.test/a four\n- five\n- six\n\nSeven: https://x.test/b\nhttps://x.test/c';
    const flat = emailBlocks(body)
      .flatMap((block) =>
        block.type === 'words'
          ? block.lines
          : block.type === 'list'
            ? block.items
            : block.type === 'link'
              ? [[{ type: 'address' as const, url: block.url }]]
              : [
                  [
                    { type: 'text' as const, text: `${block.label}: ` },
                    { type: 'address' as const, url: block.url },
                  ],
                ],
      )
      .map((line) => line.map((part) => (part.type === 'text' ? part.text : part.url)).join(''));
    expect(flat).toEqual([
      'Hello,',
      'One: two.',
      'Three https://x.test/a four',
      'five',
      'six',
      'Seven: https://x.test/b',
      'https://x.test/c',
    ]);
  });
});

describe('the email layout: the one button', () => {
  it('UX-PP-10: the button is the first link on its own line to one of Gaff’s own pages', () => {
    const blocks = emailBlocks(
      `See:\nhttps://www.daft.ie/123\n\nBook here:\n${APP}/r/a\n${APP}/r/b`,
    );
    expect(buttonLink(blocks, APP)).toBe(`${APP}/r/a`);
  });

  it('UX-PP-10: a link to anywhere else is never the button', () => {
    expect(buttonLink(emailBlocks('See:\nhttps://www.daft.ie/123'), APP)).toBeNull();
    expect(buttonLink(emailBlocks('See:\nhttps://app.gaff.test.evil.example/r/a'), APP)).toBeNull();
  });

  it('UX-PP-10: a message with no link has no button', () => {
    expect(buttonLink(emailBlocks('Hello,\n\nYou’re on the waiting list.'), APP)).toBeNull();
    // The privacy notice is named by its words; it is a quiet link, not the message's purpose.
    expect(buttonLink(emailBlocks(`How we use your details: ${APP}/privacy/h`), APP)).toBeNull();
  });
});

describe('the email layout: naming a web address', () => {
  it('UX-PP-10: an address the words don’t name is named by its site', () => {
    expect(siteName('https://www.daft.ie/for-rent/123')).toBe('daft.ie');
    expect(siteName('https://app.gaff.test/r/token')).toBe('app.gaff.test');
    expect(siteName('not an address')).toBe('link');
  });
});
