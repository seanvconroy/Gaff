import { env } from '@/lib/env';
import type { AdvertReader, AiDrafter } from '@/ports/ai';
import { bedrockDrafter } from './bedrock';
import { bedrockAdvertReader } from './bedrock-reader';
import { fakeDrafter } from './fake';
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
