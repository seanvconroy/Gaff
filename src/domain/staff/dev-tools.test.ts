import { describe, expect, it } from 'vitest';
import { devToolsAccess } from './dev-tools';

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
