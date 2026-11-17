import type { PeopleQuestionReader } from '@/ports/ai';

/**
 * The local stand-in for reading a question about who's enquired. Plain code has already read
 * everything it can (src/domain/fit/ask.ts), so the stand-in understands nothing more: whatever
 * plain code couldn't read is declined, in the fixed words, exactly as with the model off.
 */
export const fakePeopleQuestionReader: PeopleQuestionReader = {
  promptVersion: 'fake-people-question-1',
  async readQuestion() {
    return { reading: { filter: null }, model: 'fake' };
  },
};
