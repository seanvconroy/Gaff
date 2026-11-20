import { describe, expect, it } from 'vitest';
import { lettingParts, partOf, partReached } from './parts';
import { stages } from './stages';

describe('UX-LP-3: a letting is shown as four parts', () => {
  it('UX-LP-3: every one of the nine stages is inside one of the four parts, in order', () => {
    expect(lettingParts).toEqual(['Set up', 'Find', 'Choose', 'Sign']);
    expect(stages.map((stage) => [stage, lettingParts[partOf(stage)]])).toEqual([
      ['setup', 'Set up'],
      ['enquiries', 'Find'],
      ['shortlist', 'Find'],
      ['viewings', 'Find'],
      ['applications', 'Choose'],
      ['checks', 'Choose'],
      ['offer', 'Choose'],
      ['tenancy', 'Sign'],
      ['close', 'Sign'],
    ]);
  });

  it('UX-LP-3: a finished letting has every part done', () => {
    expect(partReached('viewings')).toBe(1);
    expect(partReached('tenancy')).toBe(3);
    expect(partReached('close')).toBe(4);
  });
});
