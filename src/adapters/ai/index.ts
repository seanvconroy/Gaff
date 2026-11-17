import { env } from '@/lib/env';
import type { AdvertReader, AiDrafter, PeopleQuestionReader } from '@/ports/ai';
import { bedrockDrafter } from './bedrock';
import { bedrockPeopleQuestionReader } from './bedrock-people';
import { bedrockAdvertReader } from './bedrock-reader';
import { fakeDrafter } from './fake';
import { fakePeopleQuestionReader } from './fake-people';
import { fakeAdvertReader } from './fake-reader';

let cached: AiDrafter | undefined;

export function aiDrafter(): AiDrafter {
  if (cached) return cached;
  const config = env();
  cached =
    config.AI_PROVIDER === 'bedrock'
      ? bedrockDrafter({ region: config.AWS_REGION, model: config.BEDROCK_MODEL_ID })
      : fakeDrafter;
  return cached;
}

let cachedPeople: PeopleQuestionReader | undefined;

/**
 * The reader of questions about who's enquired (UX-LP-15): the same provider as the drafter, so
 * there is one AI setting and no new vendor. Plain code reads first; this is asked only for what
 * it couldn't, and only for a question already cleared of anything about who a person is.
 */
export function peopleQuestionReader(): PeopleQuestionReader {
  if (cachedPeople) return cachedPeople;
  const config = env();
  cachedPeople =
    config.AI_PROVIDER === 'bedrock'
      ? bedrockPeopleQuestionReader({ region: config.AWS_REGION, model: config.BEDROCK_MODEL_ID })
      : fakePeopleQuestionReader;
  return cachedPeople;
}

let cachedReader: AdvertReader | undefined;

/**
 * The reader of adverts (work package WP-10): the same provider as the drafter, so there is one
 * AI setting and no new vendor. Whether reading is offered at all is `ADVERT_READER`
 * (src/server/lettings/advert-reader.ts).
 */
export function advertReader(): AdvertReader {
  if (cachedReader) return cachedReader;
  const config = env();
  cachedReader =
    config.AI_PROVIDER === 'bedrock'
      ? bedrockAdvertReader({ region: config.AWS_REGION, model: config.BEDROCK_MODEL_ID })
      : fakeAdvertReader;
  return cachedReader;
}
