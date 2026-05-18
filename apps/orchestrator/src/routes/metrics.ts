import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import {
  db,
  pipelineJobs,
  outreachMessages,
  generatedSites,
} from '@desany/db';
import { getQueueDepths, type Queues } from '../queues.js';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function registerMetricsRoutes(
  app: FastifyInstance,
  ctx: { queues: Queues },
): Promise<void> {
  app.get('/metrics', async (_request, reply) => {
    const queueDepths = await getQueueDepths(ctx.queues);

    const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);

    type StageRow = { stage: string; status: string | null; count: number };
    const throughput = (await db.execute(sql`
      SELECT stage, status, COUNT(*)::int AS count
      FROM pipeline_jobs
      WHERE updated_at >= ${since}
      GROUP BY stage, status
    `)).rows as unknown as StageRow[];

    const byStage: Record<string, { completed: number; failed: number; running: number; pending: number; total: number }> = {};
    for (const row of throughput) {
      const stage = row.stage;
      if (!byStage[stage]) byStage[stage] = { completed: 0, failed: 0, running: 0, pending: 0, total: 0 };
      const bucket = byStage[stage];
      bucket.total += row.count;
      const status = row.status ?? 'unknown';
      if (status === 'completed') bucket.completed += row.count;
      else if (status === 'failed') bucket.failed += row.count;
      else if (status === 'running') bucket.running += row.count;
      else if (status === 'pending') bucket.pending += row.count;
    }

    const errorCountsByStage = await db
      .select({
        stage: pipelineJobs.stage,
        count: sql<number>`count(*)::int`,
      })
      .from(pipelineJobs)
      .where(sql`${pipelineJobs.status} = 'failed'`)
      .groupBy(pipelineJobs.stage);

    const errorTotals: Record<string, number> = {};
    for (const row of errorCountsByStage) {
      errorTotals[row.stage] = row.count;
    }

    const emails24h = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(outreachMessages)
      .where(sql`${outreachMessages.sentAt} >= ${since}`);

    const deploys24h = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(generatedSites)
      .where(sql`${generatedSites.deployedAt} >= ${since}`);

    return reply.send({
      timestamp: new Date().toISOString(),
      queueDepths,
      throughput24h: byStage,
      errorCounts: errorTotals,
      sideMetrics24h: {
        emailsSent: emails24h[0]?.count ?? 0,
        sitesDeployed: deploys24h[0]?.count ?? 0,
      },
    });
  });
}
