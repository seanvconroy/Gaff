import { describe, expect, it } from 'vitest';
import { setupChecklistFor } from './setup-checklist';

describe('UX-HM-6: the setup checklist holds Today’s only primary button', () => {
  it('isn’t built yet (WP-27), so nobody has one and Today has no primary button', () => {
    expect(setupChecklistFor({ userId: 'ann' })).toBeNull();
  });
});
