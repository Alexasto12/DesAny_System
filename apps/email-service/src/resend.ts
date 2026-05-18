import { Resend } from 'resend';
import { config } from './config.js';
import { logger } from './logger.js';

const resend = new Resend(config.RESEND_API_KEY);

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as Record<string, unknown>;
  const name = typeof anyErr.name === 'string' ? anyErr.name.toLowerCase() : '';
  const message = typeof anyErr.message === 'string' ? anyErr.message.toLowerCase() : '';
  const status = anyErr.statusCode ?? anyErr.status;
  if (status === 429) return true;
  if (name.includes('rate_limit') || name.includes('ratelimit')) return true;
  if (message.includes('rate limit') || message.includes('too many requests')) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= MAX_RETRIES) {
    try {
      const response = await resend.emails.send({
        from: config.EMAIL_FROM,
        to: args.to,
        subject: args.subject,
        html: args.html,
        replyTo: args.replyTo ?? config.EMAIL_REPLY_TO,
      });

      if (response.error) {
        if (isRateLimitError(response.error) && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          logger.warn({ attempt, delay, error: response.error }, 'resend rate limit, retrying');
          await sleep(delay);
          attempt++;
          continue;
        }
        throw new Error(`Resend error: ${response.error.message ?? JSON.stringify(response.error)}`);
      }

      const id = response.data?.id;
      if (!id) {
        throw new Error('Resend returned no id');
      }
      return { id };
    } catch (err) {
      lastError = err;
      if (isRateLimitError(err) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn({ attempt, delay, err }, 'resend rate limit (thrown), retrying');
        await sleep(delay);
        attempt++;
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error('sendEmail exhausted retries');
}
