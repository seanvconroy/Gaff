import { describe, expect, it } from 'vitest';
import { openBytes, openJson, sealBytes, sealJson } from './crypto';

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

describe('P53: renters’ documents are encrypted with Gaff’s key before they’re stored', () => {
  it('round-trips a file, and the stored bytes don’t show it', () => {
    const plain = Buffer.from('%PDF-1.4 Employee: Niamh Kelly');
    const sealed = sealBytes(plain);
    expect(sealed.includes(Buffer.from('Niamh'))).toBe(false);
    expect(openBytes(sealed)).toEqual(plain);
  });

  it('refuses a file that isn’t sealed, or was changed', () => {
    expect(() => openBytes(Buffer.from('%PDF-1.4'))).toThrow();
    const sealed = sealBytes(Buffer.from('payslip'));
    sealed[sealed.length - 1] = sealed[sealed.length - 1]! ^ 1;
    expect(() => openBytes(sealed)).toThrow();
  });
});
