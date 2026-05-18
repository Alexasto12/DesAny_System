import { z } from 'zod';

const configSchema = z.object({
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  EMAIL_FROM: z.string().min(1),
  EMAIL_REPLY_TO: z.string().email().optional(),
  EMAIL_DAILY_CAP: z.coerce.number().int().positive().default(40),
  TRACKING_BASE_URL: z.string().url(),
  EMAIL_LANGUAGE: z.enum(['en', 'es']).default('en'),
  SENDER_NAME: z.string().min(1).default('Your Name'),
  SENDER_TITLE: z.string().min(1).default('Founder, DesAny'),
  REDIS_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  HTTP_PORT: z.coerce.number().int().positive().default(4000),
  HTTP_HOST: z.string().default('0.0.0.0'),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = configSchema.parse(process.env);
