// Set required env vars BEFORE any test module imports config.ts.
process.env.RESEND_API_KEY ??= 'test_key';
process.env.EMAIL_FROM ??= 'DesAny <hola@desany.dev>';
process.env.TRACKING_BASE_URL ??= 'https://track.desany.dev';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.DATABASE_URL ??= 'postgresql://desany:desany@localhost:5432/desany';
process.env.EMAIL_DAILY_CAP ??= '5';
process.env.LOG_LEVEL ??= 'fatal';
