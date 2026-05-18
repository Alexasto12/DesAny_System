import Fastify, { type FastifyInstance } from 'fastify';
import { logger } from './logger.js';
import { config } from './config.js';
import type { Queues } from './queues.js';
import { registerCampaignRoutes } from './routes/campaigns.js';
import { registerLeadRoutes } from './routes/leads.js';
import { registerMetricsRoutes } from './routes/metrics.js';

export interface BuildServerOptions {
  queues: Queues;
}

export async function buildServer(opts: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 1024 * 64,
  });

  app.setErrorHandler((err, request, reply) => {
    const e = err as Error & { statusCode?: number };
    logger.error(
      { err: e.message, stack: e.stack, url: request.url, method: request.method },
      'fastify error',
    );
    reply.code(e.statusCode ?? 500).send({
      error: e.name || 'internal_error',
      message: e.message,
    });
  });

  app.get('/health', async () => ({ status: 'ok', service: 'orchestrator' }));

  await registerCampaignRoutes(app, opts);
  await registerLeadRoutes(app, opts);
  await registerMetricsRoutes(app, opts);

  return app;
}

export async function startServer(opts: BuildServerOptions): Promise<FastifyInstance> {
  const app = await buildServer(opts);
  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info({ port: config.PORT, host: config.HOST }, 'orchestrator HTTP listening');
  return app;
}
