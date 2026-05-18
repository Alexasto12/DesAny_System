// Set required env vars BEFORE any test module imports config.ts.
process.env.PORT ??= '3001';
process.env.HOST ??= '127.0.0.1';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.DATABASE_URL ??= 'postgresql://desany:desany@localhost:5432/desany';
process.env.LOG_LEVEL ??= 'fatal';
process.env.SCHEDULER_INTERVAL_MS ??= '60000';
process.env.STUCK_JOB_TIMEOUT_MS ??= '1800000';
process.env.NODE_ENV ??= 'test';
