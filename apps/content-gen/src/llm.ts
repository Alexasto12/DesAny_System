import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { ZodSchema } from 'zod';
import type { Logger } from 'pino';

export interface LlmClientOptions {
  baseURL: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
  maxJsonRetries?: number;
  maxNetworkRetries?: number;
  logger: Logger;
  temperature?: number;
}

export interface ChatJsonArgs<T> {
  system: string;
  user: string;
  schema: ZodSchema<T>;
  promptName: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function hashPrompt(system: string, user: string): string {
  return createHash('sha256').update(system).update('\n--\n').update(user).digest('hex').slice(0, 16);
}

function stripJsonFences(raw: string): string {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/```\s*$/i, '').trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

export class LlmClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxJsonRetries: number;
  private readonly maxNetworkRetries: number;
  private readonly temperature: number;
  private readonly logger: Logger;

  constructor(options: LlmClientOptions) {
    this.client = new OpenAI({
      baseURL: options.baseURL,
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 60_000,
    });
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxJsonRetries = options.maxJsonRetries ?? 2;
    this.maxNetworkRetries = options.maxNetworkRetries ?? 3;
    this.temperature = options.temperature ?? 0.3;
    this.logger = options.logger;
  }

  async chatJSON<T>(args: ChatJsonArgs<T>): Promise<T> {
    const promptHash = hashPrompt(args.system, args.user);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ];

    let lastZodError: string | null = null;

    for (let jsonAttempt = 0; jsonAttempt <= this.maxJsonRetries; jsonAttempt += 1) {
      const completion = await this.callWithBackoff(messages, promptHash, args.promptName, jsonAttempt);
      const raw = completion.content;
      const cleaned = stripJsonFences(raw);

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch (err) {
        lastZodError = `not parseable as JSON: ${(err as Error).message}`;
        this.logger.warn(
          { promptName: args.promptName, promptHash, attempt: jsonAttempt, error: lastZodError },
          'llm response not valid JSON, retrying',
        );
        messages.push({ role: 'assistant', content: raw });
        messages.push({
          role: 'user',
          content: `Your previous response was invalid: ${lastZodError}. Return only valid JSON matching the schema.`,
        });
        continue;
      }

      const result = args.schema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }

      lastZodError = result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ');
      this.logger.warn(
        { promptName: args.promptName, promptHash, attempt: jsonAttempt, error: lastZodError },
        'llm response failed schema validation, retrying',
      );
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content: `Your previous response was invalid: ${lastZodError}. Return only valid JSON matching the schema.`,
      });
    }

    throw new Error(
      `llm response failed validation after ${this.maxJsonRetries + 1} attempts (last error: ${lastZodError ?? 'unknown'})`,
    );
  }

  private async callWithBackoff(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    promptHash: string,
    promptName: string,
    jsonAttempt: number,
  ): Promise<{ content: string }> {
    let lastErr: unknown;
    for (let netAttempt = 0; netAttempt <= this.maxNetworkRetries; netAttempt += 1) {
      const startedAt = Date.now();
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          temperature: this.temperature,
          messages,
        });
        const latencyMs = Date.now() - startedAt;
        const choice = completion.choices[0];
        const content = choice?.message?.content ?? '';
        const usage = completion.usage;
        this.logger.info(
          {
            promptName,
            promptHash,
            jsonAttempt,
            netAttempt,
            latencyMs,
            promptTokens: usage?.prompt_tokens ?? null,
            completionTokens: usage?.completion_tokens ?? null,
            totalTokens: usage?.total_tokens ?? null,
            finishReason: choice?.finish_reason ?? null,
            model: this.model,
          },
          'llm call complete',
        );
        return { content };
      } catch (err) {
        lastErr = err;
        const latencyMs = Date.now() - startedAt;
        const transient = isTransient(err);
        this.logger.warn(
          { promptName, promptHash, jsonAttempt, netAttempt, latencyMs, transient, error: (err as Error).message },
          'llm call failed',
        );
        if (!transient || netAttempt === this.maxNetworkRetries) {
          break;
        }
        const backoff = 500 * 2 ** netAttempt;
        await sleep(backoff);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('llm call failed');
  }
}

function isTransient(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { status?: number; code?: string; message?: string };
  if (anyErr.status && anyErr.status >= 500) return true;
  if (anyErr.status === 429) return true;
  if (anyErr.code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH'].includes(anyErr.code)) {
    return true;
  }
  if (typeof anyErr.message === 'string' && /timeout|temporarily|reset|socket hang up/i.test(anyErr.message)) {
    return true;
  }
  return false;
}
