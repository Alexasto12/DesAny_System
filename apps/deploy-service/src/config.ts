import { z } from 'zod';

const ConfigSchema = z.object({
  VERCEL_TOKEN: z.string().min(1, 'VERCEL_TOKEN is required'),
  VERCEL_TEAM_ID: z.string().optional(),
  REDIS_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.string().default('info'),
  DEPLOY_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  DEPLOY_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  SITE_WORK_DIR: z.string().default('/tmp/desany/sites'),
  TEMPLATE_SCRIPT_PATH: z.string().default('packages/templates/scripts/generate-site.ts'),
  MONOREPO_ROOT: z.string().default(process.cwd()),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
