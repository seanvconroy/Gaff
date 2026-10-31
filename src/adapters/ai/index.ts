import { env } from '@/lib/env';
import type { AiDrafter } from '@/ports/ai';
import { bedrockDrafter } from './bedrock';
import { fakeDrafter } from './fake';

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
