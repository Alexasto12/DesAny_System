export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  factor?: number;
  maxMs?: number;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  shouldRetry?: (err: unknown) => boolean;
  delayFor?: (err: unknown, attempt: number) => number | undefined;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'shouldRetry' | 'delayFor'>> = {
  attempts: 3,
  baseMs: 2000,
  factor: 2,
  maxMs: 30_000,
};

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const cfg = { ...DEFAULT_OPTIONS, ...options };
  let lastErr: unknown;

  for (let attempt = 1; attempt <= cfg.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const canRetry = options.shouldRetry ? options.shouldRetry(err) : true;
      if (!canRetry || attempt === cfg.attempts) {
        throw err;
      }
      const overrideDelay = options.delayFor?.(err, attempt);
      const expDelay = Math.min(cfg.baseMs * cfg.factor ** (attempt - 1), cfg.maxMs);
      const delay = overrideDelay ?? expDelay;
      options.onRetry?.(err, attempt, delay);
      await sleep(delay);
    }
  }

  throw lastErr;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
