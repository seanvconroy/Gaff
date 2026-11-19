import { describe, expect, it } from 'vitest';
import { devToolsAccess, standInCheckAccess } from './dev-tools';

describe('BA-1: the development tools on a test copy with a public address', () => {
  it('are for nobody when they are off', () => {
    expect(devToolsAccess({ devTools: false, realEmail: false })).toBe('nobody');
    expect(devToolsAccess({ devTools: false, realEmail: true })).toBe('nobody');
  });

  it('stay open locally and in tests, where every email is in the outbox', () => {
    expect(devToolsAccess({ devTools: true, realEmail: false })).toBe('anyone');
  });

  it('are for Gaff’s own team only where email is really sent', () => {
    expect(devToolsAccess({ devTools: true, realEmail: true })).toBe('staff');
  });
});

describe('BA-6: a tester’s own stand-in check on the test copy', () => {
  it('opens for the person the check belongs to, through its own link, where email is really sent', () => {
    expect(standInCheckAccess({ devTools: true, realEmail: true, ownLink: true })).toBe('anyone');
  });

  it('is Gaff’s team only without that link, and nobody’s with the tools off', () => {
    expect(standInCheckAccess({ devTools: true, realEmail: true, ownLink: false })).toBe('staff');
    expect(standInCheckAccess({ devTools: false, realEmail: true, ownLink: true })).toBe('nobody');
    expect(standInCheckAccess({ devTools: false, realEmail: false, ownLink: true })).toBe('nobody');
    expect(standInCheckAccess({ devTools: true, realEmail: false, ownLink: false })).toBe('anyone');
  });
});
