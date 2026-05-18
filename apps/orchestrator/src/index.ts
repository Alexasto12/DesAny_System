import { config } from './config.js';
import { logger } from './logger.js';
import { buildQueues } from './queues.js';
import { startServer } from './server.js';
import { startScheduler } from './scheduler.js';

async function main(): Promise<void> {
  logger.info({ port: config.PORT, host: config.HOST }, 'starting orchestrator');

  const queues = buildQueues();
  const scheduler = startScheduler(queues);

  const app = await startServer({ queues });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down orchestrator');
    try {
      await scheduler.stop();
      await app.close();
      await queues.close();
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'error during shutdown');
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
}

main().catch((err: unknown) => {
  logger.error({ err: (err as Error).message, stack: (err as Error).stack }, 'fatal orchestrator error');
  process.exit(1);
});
