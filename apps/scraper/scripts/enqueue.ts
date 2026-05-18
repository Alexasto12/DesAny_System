import { parseArgs } from 'node:util';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { z } from 'zod';
import type { ScrapeJobPayload } from '@desany/types';

const { values } = parseArgs({
  options: {
    category: { type: 'string' },
    city: { type: 'string' },
    limit: { type: 'string', default: '50' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(
    'Usage: pnpm tsx scripts/enqueue.ts --category "hair salons" --city "Los Angeles" --limit 50',
  );
  process.exit(0);
}

const argsSchema = z.object({
  category: z.string().min(1, '--category is required'),
  city: z.string().min(1, '--city is required'),
  limit: z.coerce.number().int().positive().max(500).default(50),
});

const parsed = argsSchema.safeParse({
  category: values.category,
  city: values.city,
  limit: values.limit,
});

if (!parsed.success) {
  console.error('Invalid arguments:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.') || 'arg'}: ${issue.message}`);
  }
  console.error(
    '\nUsage: pnpm tsx scripts/enqueue.ts --category "hair salons" --city "Los Angeles" --limit 50',
  );
  process.exit(1);
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue<ScrapeJobPayload>('scrape', { connection });

try {
  const payload: ScrapeJobPayload = {
    category: parsed.data.category,
    city: parsed.data.city,
    limit: parsed.data.limit,
  };

  const job = await queue.add('scrape', payload, {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });

  console.log(
    JSON.stringify({ ok: true, jobId: job.id, queue: 'scrape', ...payload }),
  );
} catch (err) {
  console.error(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exitCode = 1;
} finally {
  await queue.close();
  await connection.quit();
}
