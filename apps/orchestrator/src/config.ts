import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  REDIS_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  STUCK_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);
