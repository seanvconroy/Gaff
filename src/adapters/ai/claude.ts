import { APIConnectionError, APIConnectionTimeoutError, APIError } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Message } from '@anthropic-ai/sdk/resources/messages';
import type { z } from 'zod';
import type { TokenCounts } from '@/domain/ai/prices';
import type { AiTask } from '@/domain/ai/tasks';
import { AiCallError, type AiProvider, type AiReply } from '@/ports/ai';
import type { MessagesClient } from './clients';
import * as advert from './prompts/advert';
import * as answers from './prompts/answers';
import * as people from './prompts/people';

/**
 * ADR-0017: each task once, for either client. Claude Opus 5.5 thinks adaptively on every call;
 * each task sets its effort. The model has no tools, every input is quoted data, and the reply
 * must fit the task's schema (structured outputs). A refusal, an answer cut short or one that
 * doesn't fit comes back as "no output", and the task falls back the way it does with no model
 * (P5). There's no server-side fallback to another model: the evals cover exactly the model
 * that runs.
 */

const versions: Record<AiTask, string> = {
  answers: answers.version,
  advert: advert.version,
  people: people.version,
};

/** Room for adaptive thinking as well as the answer; only what's used is billed. */
const MAX_TOKENS = 16_000;

interface TaskCall<S extends z.ZodType> {
  effort: 'low' | 'medium' | 'high';
  timeoutMs: number;
  maxRetries: number;
  schema: S;
  system: string;
  content: string;
}

export function usageOf(message: Pick<Message, 'usage'>): TokenCounts {
  return {
    inputTokens: message.usage.input_tokens ?? 0,
    outputTokens: message.usage.output_tokens ?? 0,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
}

/** The reply's JSON, checked against the task's schema. Anything else is no output at all. */
export function readOutput<S extends z.ZodType>(message: Message, schema: S): z.infer<S> | null {
  if (message.stop_reason !== 'end_turn') return null;
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []));
  if (text.length === 0) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text.join('')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function claudeProvider(config: {
  name: 'anthropic' | 'bedrock';
  client: MessagesClient;
  model: string;
}): AiProvider {
  const wireModel = config.name === 'bedrock' ? `anthropic.${config.model}` : config.model;

  async function run<S extends z.ZodType>(call: TaskCall<S>): Promise<AiReply<z.infer<S>>> {
    let message: Message;
    try {
      message = await config.client.messages.create(
        {
          model: wireModel,
          max_tokens: MAX_TOKENS,
          output_config: { effort: call.effort, format: zodOutputFormat(call.schema) },
          system: [{ type: 'text', text: call.system }],
          messages: [{ role: 'user', content: call.content }],
        },
        { timeout: call.timeoutMs, maxRetries: call.maxRetries },
      );
    } catch (error) {
      if (error instanceof APIConnectionTimeoutError) {
        throw new AiCallError('timeout', { cause: error });
      }
      if (error instanceof APIError || error instanceof APIConnectionError) {
        throw new AiCallError('error', { cause: error });
      }
      throw error;
    }
    const refused = message.stop_reason === 'refusal';
    return {
      output: refused ? null : readOutput(message, call.schema),
      refused,
      model: message.model ?? wireModel,
      usage: usageOf(message),
    };
  }

  return {
    name: config.name,
    model: config.model,
    promptVersion: (task) => versions[task],
    draftAnswers: (request) =>
      run({
        effort: answers.effort,
        timeoutMs: answers.timeoutMs,
        maxRetries: answers.maxRetries,
        schema: answers.schema,
        system: answers.system(request.operatorName),
        content: answers.userContent(request),
      }),
    readAdvert: (request) =>
      run({
        effort: advert.effort,
        timeoutMs: advert.timeoutMs,
        maxRetries: advert.maxRetries,
        schema: advert.schema,
        system: advert.system,
        content: advert.userContent(request),
      }),
    async readPeopleQuestion(request) {
      const reply = await run({
        effort: people.effort,
        timeoutMs: people.timeoutMs,
        maxRetries: people.maxRetries,
        schema: people.schema,
        system: people.system,
        content: people.userContent(request),
      });
      return { ...reply, output: reply.output === null ? null : people.withoutNulls(reply.output) };
    },
  };
}
