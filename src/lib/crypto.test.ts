import { describe, expect, it } from 'vitest';
import { openJson, sealJson } from './crypto';

describe('ADR-0005: check results are encrypted in the application', () => {
  it('round-trips a value, and the stored text reveals nothing', () => {
    const sealed = sealJson({ monthlyIncomeCents: 510_000 });
    expect(sealed).toMatch(/^v1:/);
    expect(sealed).not.toContain('510000');
    expect(openJson(sealed)).toEqual({ monthlyIncomeCents: 510_000 });
  });

  it('uses a fresh IV each time, and refuses tampered text', () => {
    expect(sealJson({ a: 1 })).not.toBe(sealJson({ a: 1 }));
    const sealed = sealJson({ a: 1 });
    const tampered = `${sealed.slice(0, -4)}AAAA`;
    expect(() => openJson(tampered)).toThrow();
  });
});
