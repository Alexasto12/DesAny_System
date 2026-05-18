import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import pino from 'pino';

const createMock = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: createMock,
        },
      };
      constructor(_opts: unknown) {
        // captured
      }
    },
  };
});

import { LlmClient } from '../llm.js';

const logger = pino({ level: 'silent' });

const widgetSchema = z.object({ widget: z.string(), count: z.number().int() }).strict();

function mockResponse(content: string) {
  return {
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

describe('LlmClient.chatJSON', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('returns the parsed object when the first call is valid', async () => {
    createMock.mockResolvedValueOnce(mockResponse('{"widget":"alpha","count":3}'));
    const client = new LlmClient({
      baseURL: 'http://test/v1',
      model: 'test-model',
      apiKey: 'EMPTY',
      maxJsonRetries: 2,
      maxNetworkRetries: 0,
      logger,
    });
    const result = await client.chatJSON({
      system: 'be helpful',
      user: 'make a widget',
      schema: widgetSchema,
      promptName: 'widget',
    });
    expect(result).toEqual({ widget: 'alpha', count: 3 });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('strips markdown fences from the response', async () => {
    createMock.mockResolvedValueOnce(mockResponse('```json\n{"widget":"alpha","count":3}\n```'));
    const client = new LlmClient({
      baseURL: 'http://test/v1',
      model: 'test-model',
      apiKey: 'EMPTY',
      maxJsonRetries: 2,
      maxNetworkRetries: 0,
      logger,
    });
    const result = await client.chatJSON({
      system: 's',
      user: 'u',
      schema: widgetSchema,
      promptName: 'widget',
    });
    expect(result).toEqual({ widget: 'alpha', count: 3 });
  });

  it('retries when the first response is invalid and succeeds on the second', async () => {
    createMock
      .mockResolvedValueOnce(mockResponse('not json at all'))
      .mockResolvedValueOnce(mockResponse('{"widget":"beta","count":7}'));
    const client = new LlmClient({
      baseURL: 'http://test/v1',
      model: 'test-model',
      apiKey: 'EMPTY',
      maxJsonRetries: 2,
      maxNetworkRetries: 0,
      logger,
    });
    const result = await client.chatJSON({
      system: 's',
      user: 'u',
      schema: widgetSchema,
      promptName: 'widget',
    });
    expect(result).toEqual({ widget: 'beta', count: 7 });
    expect(createMock).toHaveBeenCalledTimes(2);
    const secondCall = createMock.mock.calls[1][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const followup = secondCall.messages[secondCall.messages.length - 1];
    expect(followup.role).toBe('user');
    expect(followup.content).toContain('Your previous response was invalid');
  });

  it('retries on schema validation failure and succeeds', async () => {
    createMock
      .mockResolvedValueOnce(mockResponse('{"widget":"gamma","count":"three"}'))
      .mockResolvedValueOnce(mockResponse('{"widget":"gamma","count":3}'));
    const client = new LlmClient({
      baseURL: 'http://test/v1',
      model: 'test-model',
      apiKey: 'EMPTY',
      maxJsonRetries: 2,
      maxNetworkRetries: 0,
      logger,
    });
    const result = await client.chatJSON({
      system: 's',
      user: 'u',
      schema: widgetSchema,
      promptName: 'widget',
    });
    expect(result).toEqual({ widget: 'gamma', count: 3 });
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all retries', async () => {
    createMock.mockResolvedValue(mockResponse('still not valid json'));
    const client = new LlmClient({
      baseURL: 'http://test/v1',
      model: 'test-model',
      apiKey: 'EMPTY',
      maxJsonRetries: 2,
      maxNetworkRetries: 0,
      logger,
    });
    await expect(
      client.chatJSON({ system: 's', user: 'u', schema: widgetSchema, promptName: 'widget' }),
    ).rejects.toThrow(/failed validation after 3 attempts/);
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it('retries transient network errors with backoff', async () => {
    const transientErr = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    createMock
      .mockRejectedValueOnce(transientErr)
      .mockResolvedValueOnce(mockResponse('{"widget":"delta","count":1}'));
    const client = new LlmClient({
      baseURL: 'http://test/v1',
      model: 'test-model',
      apiKey: 'EMPTY',
      maxJsonRetries: 0,
      maxNetworkRetries: 2,
      logger,
    });
    const result = await client.chatJSON({
      system: 's',
      user: 'u',
      schema: widgetSchema,
      promptName: 'widget',
    });
    expect(result).toEqual({ widget: 'delta', count: 1 });
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
