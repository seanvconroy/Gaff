import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';

/**
 * The two ways Gaff reaches Claude (Q37, ADR-0025). Both expose the same Messages API, so each
 * task is written once. The Claude API serves the test copy and development, with made-up data
 * only; Bedrock's in-region endpoint in Dublin serves production, with invocation logging off.
 */
export type MessagesClient = Pick<Anthropic, 'messages'>;

export function claudeApiClient(apiKey: string): MessagesClient {
  return new Anthropic({ apiKey, maxRetries: 2 });
}

/** Credentials come from the standard AWS variables of the Vercel project. */
export function bedrockClient(region: string): MessagesClient {
  return new AnthropicBedrockMantle({ awsRegion: region, maxRetries: 2 });
}
