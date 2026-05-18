import { pino } from 'pino';

export function createLogger(level: string = 'info') {
  return pino({
    level,
    base: { service: 'deploy-service' },
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
