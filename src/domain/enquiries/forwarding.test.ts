import { describe, expect, it } from 'vitest';
import {
  confirmationsFor,
  forwardingFromQuery,
  forwardingHref,
  forwardingInPlace,
  forwardingLeaveHref,
  forwardingStillToDo,
  isForwardingService,
  isTestEnquiry,
  newTestRef,
  noForwarding,
  testRefLine,
  testState,
} from './forwarding';

const at = new Date('2026-11-17T10:00:00Z');
const later = new Date('2026-11-17T10:03:00Z');

describe('UX-LT-17: the mail services the flow has steps for', () => {
  it('UX-LT-17: Gmail, Outlook and something else, and nothing more', () => {
    expect(['gmail', 'outlook', 'other'].every(isForwardingService)).toBe(true);
    expect(isForwardingService('yahoo')).toBe(false);
    expect(isForwardingService(undefined)).toBe(false);
  });

  it('UX-LT-18: the confirming screen looks for that service’s confirmation, or any for something else', () => {
    expect(confirmationsFor('gmail')).toEqual(['gmail']);
    expect(confirmationsFor('outlook')).toEqual(['outlook']);
    expect(confirmationsFor('other')).toEqual(['gmail', 'outlook']);
  });
});

describe('UX-LT-19, UX-LT-20: forwarding is in place once mail has come through a rule', () => {
  it('UX-LT-20: nothing has arrived, so forwarding is still to do', () => {
    expect(forwardingInPlace(noForwarding)).toBe(false);
    expect(forwardingStillToDo(noForwarding)).toBe(true);
  });

  it('UX-LT-19: once the test (or a real enquiry) has come through, it is done', () => {
    expect(forwardingInPlace({ worksAt: later })).toBe(true);
    expect(forwardingStillToDo({ worksAt: later })).toBe(false);
  });

  it('UX-LT-19: the last screen waits for the test it sent, then shows it answered', () => {
    expect(testState(noForwarding)).toBe('not_sent');
    expect(testState({ ...noForwarding, testSentAt: at })).toBe('waiting');
    expect(testState({ worksAt: later, testSentAt: at, testArrivedAt: later })).toBe('arrived');
    // Forwarding already worked once (a real enquiry), and a new test is on its way.
    expect(testState({ worksAt: at, testSentAt: later, testArrivedAt: null })).toBe('waiting');
  });
});

describe('UX-LT-19: the test enquiry is known by its reference when the rule forwards it back', () => {
  const ref = newTestRef(new Uint8Array(Array.from({ length: 12 }, (_, i) => i * 7)));

  it('UX-LT-19: a reference is twelve lower-case letters and digits', () => {
    expect(ref).toMatch(/^[a-z2-9]{12}$/);
    expect(() => newTestRef(new Uint8Array(4))).toThrow();
  });

  it('UX-LT-19: the reference line, as written, or quoted by the mail service', () => {
    const text = ['Name: Sam Sample', testRefLine(ref)].join('\n');
    expect(isTestEnquiry({ subject: 'Fwd: something', text }, ref)).toBe(true);
    const quoted = ['---------- Forwarded message ---------', `> ${testRefLine(ref)}`].join('\n');
    expect(isTestEnquiry({ subject: 'Fwd: something', text: quoted }, ref)).toBe(true);
    expect(isTestEnquiry({ subject: `Test enquiry from Gaff (${ref})`, text: '' }, ref)).toBe(
      true,
    );
  });

  it('UX-LT-19: anything else is not the test: another reference, none sent, or the ref in passing', () => {
    const text = testRefLine(ref);
    expect(isTestEnquiry({ subject: '', text }, null)).toBe(false);
    expect(isTestEnquiry({ subject: '', text }, 'abcdefghijkm')).toBe(false);
    expect(isTestEnquiry({ subject: '', text: `They said ${testRefLine(ref)} today` }, ref)).toBe(
      false,
    );
    // A reference can't be made to match everything.
    expect(isTestEnquiry({ subject: '', text: 'Gaff test reference: .*' }, '.*')).toBe(false);
  });
});

describe('UX-LT-17, UX-LT-20: the flow’s addresses', () => {
  const lettingId = '0b5f3c1e-8a2d-4e6f-9b7a-1c2d3e4f5a6b';

  it('UX-LT-20: from a letting, the flow comes back to it; from Settings, to Settings', () => {
    expect(forwardingHref({ lettingId })).toBe(`/forwarding?letting=${lettingId}`);
    expect(forwardingHref({ lettingId }, 'confirm', 'gmail')).toBe(
      `/forwarding/gmail/confirm?letting=${lettingId}`,
    );
    expect(forwardingHref({}, 'steps', 'outlook')).toBe('/forwarding/outlook');
    expect(forwardingLeaveHref({ lettingId })).toBe(`/lettings/${lettingId}`);
    expect(forwardingLeaveHref({ lettingId, justLive: true })).toBe(
      `/lettings/${lettingId}?saved=live`,
    );
    expect(forwardingLeaveHref({})).toBe('/settings');
  });

  it('UX-LT-17: only a letting’s ID is read from the address; anything else is ignored', () => {
    expect(forwardingFromQuery({ letting: lettingId, live: '1' })).toEqual({
      lettingId,
      justLive: true,
    });
    expect(forwardingFromQuery({ letting: 'https://example.com', live: '1' })).toEqual({
      lettingId: null,
      justLive: false,
    });
    expect(forwardingFromQuery({})).toEqual({ lettingId: null, justLive: false });
  });
});
