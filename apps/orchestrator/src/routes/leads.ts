import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  db,
  leads,
  leadEnrichments,
  pipelineJobs,
  generatedSites,
  outreachMessages,
} from '@desany/db';
import type { JobStage } from '@desany/types';
import { enqueueStage, type Queues } from '../queues.js';
import { nextStageForRetry } from '../stateMachine.js';
import { logger } from '../logger.js';

const listQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function registerLeadRoutes(
  app: FastifyInstance,
  ctx: { queues: Queues },
): Promise<void> {
  app.get('/leads', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', issues: parsed.error.issues });
    }
    const { status, limit, offset } = parsed.data;

    const whereClause = status ? eq(leads.status, status) : undefined;

    const rows = await db
      .select({
        id: leads.id,
        businessName: leads.businessName,
        category: leads.category,
        city: leads.city,
        email: leads.email,
        phone: leads.phone,
        website: leads.website,
        status: leads.status,
        scrapedAt: leads.scrapedAt,
      })
      .from(leads)
      .where(whereClause)
      .orderBy(desc(leads.id))
      .limit(limit)
      .offset(offset);

    // Resolve current pipeline stage for each lead via the latest pipeline_jobs row.
    const leadIds = rows.map((r) => r.id);

    type LatestRow = {
      leadId: number;
      stage: string;
      status: string | null;
      updatedAt: Date | null;
    };

    const latestPipeline: LatestRow[] = leadIds.length
      ? ((await db.execute(sql`
          SELECT DISTINCT ON (lead_id)
            lead_id AS "leadId",
            stage,
            status,
            updated_at AS "updatedAt"
          FROM pipeline_jobs
          WHERE lead_id = ANY(${leadIds})
          ORDER BY lead_id, updated_at DESC, id DESC
        `)).rows as unknown as LatestRow[])
      : [];

    const byLead = new Map<number, LatestRow>();
    for (const r of latestPipeline) byLead.set(r.leadId, r);

    const totalRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(whereClause);

    return reply.send({
      leads: rows.map((r) => {
        const latest = byLead.get(r.id);
        return {
          ...r,
          currentStage: latest?.stage ?? null,
          currentStageStatus: latest?.status ?? null,
          currentStageUpdatedAt: latest?.updatedAt ?? null,
        };
      }),
      pagination: {
        limit,
        offset,
        total: totalRow[0]?.count ?? 0,
      },
    });
  });

  app.get<{ Params: { id: string } }>(
    '/leads/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(id)) {
        return reply.code(400).send({ error: 'invalid_id' });
      }

      const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
      if (!lead) {
        return reply.code(404).send({ error: 'lead_not_found', id });
      }

      const enrichment = await db.query.leadEnrichments.findFirst({
        where: eq(leadEnrichments.leadId, id),
      });

      const sites = await db
        .select()
        .from(generatedSites)
        .where(eq(generatedSites.leadId, id))
        .orderBy(desc(generatedSites.id));

      const outreach = await db
        .select()
        .from(outreachMessages)
        .where(eq(outreachMessages.leadId, id))
        .orderBy(desc(outreachMessages.id));

      const pipeline = await db
        .select()
        .from(pipelineJobs)
        .where(eq(pipelineJobs.leadId, id))
        .orderBy(desc(pipelineJobs.updatedAt));

      return reply.send({
        lead,
        enrichment: enrichment ?? null,
        sites,
        outreach,
        pipeline,
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/leads/:id/retry',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(id)) {
        return reply.code(400).send({ error: 'invalid_id' });
      }

      const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
      if (!lead) {
        return reply.code(404).send({ error: 'lead_not_found', id });
      }

      // Find the most recent failed pipeline_jobs row for this lead.
      const failed = await db.query.pipelineJobs.findFirst({
        where: and(eq(pipelineJobs.leadId, id), eq(pipelineJobs.status, 'failed')),
        orderBy: [desc(pipelineJobs.updatedAt), desc(pipelineJobs.id)],
      });

      if (!failed) {
        return reply.code(409).send({
          error: 'no_failed_job',
          message: `lead ${id} has no failed pipeline_jobs row to retry`,
        });
      }

      const stage = nextStageForRetry(failed.stage as JobStage) as JobStage;

      // Build the right payload for the retry stage.
      let payload: Record<string, unknown>;
      if (stage === 'build-site' || stage === 'send-outreach') {
        const site = await db.query.generatedSites.findFirst({
          where: eq(generatedSites.leadId, id),
          orderBy: [desc(generatedSites.id)],
        });
        if (!site) {
          return reply.code(409).send({
            error: 'no_site_for_retry',
            message: `lead ${id} has no generated_sites row, cannot retry ${stage}`,
          });
        }
        payload = { siteId: site.id };
      } else if (stage === 'enrich' || stage === 'generate-content') {
        payload = { leadId: id };
      } else {
        // scrape retry doesn't make sense at the lead level — scrape produces leads.
        return reply.code(409).send({
          error: 'unretryable_stage',
          message: `stage ${stage} cannot be retried at the lead level`,
        });
      }

      // Reset the pipeline row to pending so the workers (and the scheduler
      // safety net) see it as in-flight again.
      await db
        .update(pipelineJobs)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(eq(pipelineJobs.id, failed.id));

      const jobId = await enqueueStage(ctx.queues, stage, payload);
      logger.info({ leadId: id, stage, jobId }, 'lead retry enqueued');

      return reply.send({
        leadId: id,
        retriedStage: stage,
        jobId,
        pipelineJobId: failed.id,
      });
    },
  );
}
