import Fastify from 'fastify';
import { config } from './config.js';
import { logger } from './logger.js';
import { startWorker } from './worker.js';
import { registerTrackingRoutes } from './tracking.js';

async function buildHttpServer() {
  const app = Fastify({ logger: false });
  await registerTrackingRoutes(app);
  return app;
}

async function main(): Promise<void> {
  const { worker, queue, redis } = startWorker();

  const app = await buildHttpServer();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down email-service');
    try {
      await worker.close();
      await queue.close();
      await app.close();
      redis.disconnect();
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });

  try {
    await app.listen({ port: config.HTTP_PORT, host: config.HTTP_HOST });
    logger.info(
      { port: config.HTTP_PORT, host: config.HTTP_HOST },
      'tracking server listening',
    );
  } catch (err) {
    logger.error({ err }, 'failed to start HTTP server');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err }, 'fatal error in email-service main');
  process.exit(1);
});
