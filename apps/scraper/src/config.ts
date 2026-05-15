import { z } from 'zod';

const schema = z.object({
  SCRAPER_STRATEGY: z.enum(['apify', 'playwright']).default('apify'),
  APIFY_TOKEN: z.string().optional(),
  APIFY_ACTOR_ID: z.string().default('compass/google-maps-extractor'),
  REDIS_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  SCRAPE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);
