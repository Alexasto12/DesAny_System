import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, eq, gte, sql } from 'drizzle-orm';
import {
  db,
  leads,
  pipelineJobs,
  generatedSites,
  outreachMessages,
} from '@desany/db';
import type { ScrapeJobPayload } from '@desany/types';
import { enqueueStage, type Queues } from '../queues.js';
import { logger } from '../logger.js';

const createCampaignSchema = z.object({
  category: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  limit: z.coerce.number().int().positive().max(500).default(50),
});

/**
 * Campaigns are virtual: there's no `campaigns` table. A campaign is
 * a single (category, city) scrape job. Its `campaignId` is the BullMQ
 * job id of the initial scrape job, which is stable for the life of the
 * job in Redis and useful for lookups.
 */
export async function registerCampaignRoutes(
  app: FastifyInstance,
  ctx: { queues: Queues },
): Promise<void> {
  app.post('/campaigns', async (request, reply) => {
    const parsed = createCampaignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        issues: parsed.error.issues,
      });
    }
    const payload: ScrapeJobPayload = parsed.data;

    try {
      const jobId = await enqueueStage(ctx.queues, 'scrape', payload);
      logger.info({ jobId, ...payload }, 'campaign created');
      return reply.code(201).send({
        campaignId: jobId,
        jobId,
        category: payload.category,
        city: payload.city,
        limit: payload.limit,
      });
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'failed to enqueue scrape job');
      return reply.code(500).send({ error: 'enqueue_failed', message: (err as Error).message });
    }
  });

  app.get<{ Params: { id: string } }>(
    '/campaigns/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const campaignId = request.params.id;

      const scrapeJob = await ctx.queues.queues.scrape.getJob(campaignId);

      if (!scrapeJob) {
        return reply.code(404).send({ error: 'campaign_not_found', campaignId });
      }

      const data = (scrapeJob.data ?? {}) as Partial<ScrapeJobPayload>;
      const category = data.category ?? null;
      const city = data.city ?? null;

      // Best-effort lookup of leads that came out of this scrape. Without
      // a campaign_id column on `leads`, we match by (category, city) and
      // bound by scrape job creation time.
      const createdMs = scrapeJob.timestamp ?? null;
      const createdAt = createdMs ? new Date(createdMs) : null;

      let aggregateLeads: Array<{ id: number; status: string | null }> = [];
      if (category && city && createdAt) {
        aggregateLeads = await db
          .select({ id: leads.id, status: leads.status })
          .from(leads)
          .where(
            and(
              eq(leads.category, category),
              eq(leads.city, city),
              gte(leads.scrapedAt, createdAt),
            ),
          );
      }

      const leadIds = aggregateLeads.map((l) => l.id);

      const siteCounts = leadIds.length
        ? await db
            .select({
              status: generatedSites.status,
              count: sql<number>`count(*)::int`,
            })
            .from(generatedSites)
            .where(sql`${generatedSites.leadId} = ANY(${leadIds})`)
            .groupBy(generatedSites.status)
        : [];

      const outreachCounts = leadIds.length
        ? await db
            .select({
              status: outreachMessages.status,
              count: sql<number>`count(*)::int`,
            })
            .from(outreachMessages)
            .where(sql`${outreachMessages.leadId} = ANY(${leadIds})`)
            .groupBy(outreachMessages.status)
        : [];

      const pipelineCounts = leadIds.length
        ? await db
            .select({
              stage: pipelineJobs.stage,
              status: pipelineJobs.status,
              count: sql<number>`count(*)::int`,
            })
            .from(pipelineJobs)
            .where(sql`${pipelineJobs.leadId} = ANY(${leadIds})`)
            .groupBy(pipelineJobs.stage, pipelineJobs.status)
        : [];

      const leadsByStatus: Record<string, number> = {};
      for (const l of aggregateLeads) {
        const s = l.status ?? 'unknown';
        leadsByStatus[s] = (leadsByStatus[s] ?? 0) + 1;
      }

      const sitesByStatus: Record<string, number> = {};
      for (const row of siteCounts) {
        sitesByStatus[row.status ?? 'unknown'] = row.count;
      }

      const outreachByStatus: Record<string, number> = {};
      for (const row of outreachCounts) {
        outreachByStatus[row.status ?? 'unknown'] = row.count;
      }

      const pipelineByStage: Record<string, Record<string, number>> = {};
      for (const row of pipelineCounts) {
        const stage = row.stage;
        const status = row.status ?? 'unknown';
        if (!pipelineByStage[stage]) pipelineByStage[stage] = {};
        pipelineByStage[stage][status] = row.count;
      }

      const scrapeState = await scrapeJob.getState();

      return reply.send({
        campaignId,
        category,
        city,
        limit: data.limit ?? null,
        scrape: {
          jobId: scrapeJob.id,
          state: scrapeState,
          attemptsMade: scrapeJob.attemptsMade,
          failedReason: scrapeJob.failedReason ?? null,
          finishedOn: scrapeJob.finishedOn ?? null,
          processedOn: scrapeJob.processedOn ?? null,
        },
        totals: {
          leadsScraped: aggregateLeads.length,
          leadsEnriched: leadsByStatus.enriched ?? 0,
          contentReady: sitesByStatus['content-ready'] ?? 0,
          deployed: sitesByStatus.deployed ?? 0,
          contacted:
            (outreachByStatus.sent ?? 0) +
            (outreachByStatus.opened ?? 0) +
            (outreachByStatus.replied ?? 0),
          failed:
            (leadsByStatus.failed ?? 0) +
            (sitesByStatus['deploy-failed'] ?? 0),
        },
        leads: { byStatus: leadsByStatus },
        sites: { byStatus: sitesByStatus },
        outreach: { byStatus: outreachByStatus },
        pipeline: pipelineByStage,
      });
    },
  );
}
