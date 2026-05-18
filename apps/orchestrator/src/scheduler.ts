import { and, eq, lt, sql } from 'drizzle-orm';
import {
  db,
  generatedSites,
  pipelineJobs,
} from '@desany/db';
import type { JobStage } from '@desany/types';
import { config } from './config.js';
import { logger } from './logger.js';
import { enqueueStage, type Queues } from './queues.js';

export interface SchedulerHandle {
  stop: () => Promise<void>;
  runOnce: () => Promise<SchedulerTick>;
}

export interface SchedulerTick {
  stuckJobsResurrected: number;
  scrapedLeadsKicked: number;
  enrichedLeadsKicked: number;
  contentReadySitesKicked: number;
  deployedSitesKicked: number;
}

async function findStuckRunningJobs(timeoutMs: number): Promise<Array<{ id: number; leadId: number | null; stage: string }>> {
  const cutoff = new Date(Date.now() - timeoutMs);
  const rows = await db
    .select({
      id: pipelineJobs.id,
      leadId: pipelineJobs.leadId,
      stage: pipelineJobs.stage,
    })
    .from(pipelineJobs)
    .where(
      and(
        eq(pipelineJobs.status, 'running'),
        lt(pipelineJobs.updatedAt, cutoff),
      ),
    )
    .limit(100);
  return rows.map((r) => ({ id: r.id, leadId: r.leadId, stage: r.stage }));
}

async function markStuckFailed(jobIds: number[], reason: string): Promise<void> {
  if (jobIds.length === 0) return;
  await db
    .update(pipelineJobs)
    .set({ status: 'failed', lastError: reason, updatedAt: new Date() })
    .where(sql`${pipelineJobs.id} = ANY(${jobIds})`);
}

async function leadsMissingPipelineRow(
  leadStatus: string,
  expectedStage: JobStage,
): Promise<Array<{ id: number }>> {
  // Find leads whose status matches `leadStatus` and that do NOT have a
  // pipeline_jobs row for `expectedStage`.
  type Row = { id: number };
  const result = await db.execute(sql`
    SELECT l.id
    FROM leads l
    WHERE l.status = ${leadStatus}
      AND NOT EXISTS (
        SELECT 1 FROM pipeline_jobs pj
        WHERE pj.lead_id = l.id AND pj.stage = ${expectedStage}
      )
    LIMIT 100
  `);
  return result.rows as unknown as Row[];
}

async function sitesMissingPipelineRow(
  siteStatus: string,
  expectedStage: JobStage,
): Promise<Array<{ id: number; leadId: number | null }>> {
  type Row = { id: number; leadId: number | null };
  const result = await db.execute(sql`
    SELECT gs.id, gs.lead_id AS "leadId"
    FROM generated_sites gs
    WHERE gs.status = ${siteStatus}
      AND NOT EXISTS (
        SELECT 1 FROM pipeline_jobs pj
        WHERE pj.lead_id = gs.lead_id AND pj.stage = ${expectedStage}
      )
    LIMIT 100
  `);
  return result.rows as unknown as Row[];
}

async function ensurePipelineRow(leadId: number, stage: JobStage): Promise<void> {
  await db.insert(pipelineJobs).values({
    leadId,
    stage,
    status: 'pending',
    attempts: 0,
  });
}

async function runTick(queues: Queues): Promise<SchedulerTick> {
  const tick: SchedulerTick = {
    stuckJobsResurrected: 0,
    scrapedLeadsKicked: 0,
    enrichedLeadsKicked: 0,
    contentReadySitesKicked: 0,
    deployedSitesKicked: 0,
  };

  // 1) Resurrect stuck `running` jobs.
  const stuck = await findStuckRunningJobs(config.STUCK_JOB_TIMEOUT_MS);
  if (stuck.length) {
    await markStuckFailed(
      stuck.map((s) => s.id),
      `stuck > ${config.STUCK_JOB_TIMEOUT_MS}ms with status=running; reset by scheduler`,
    );
    for (const job of stuck) {
      try {
        if (job.stage === 'generate-content') {
          if (job.leadId != null) {
            await enqueueStage(queues, job.stage, { leadId: job.leadId });
          }
        } else if (job.stage === 'build-site' || job.stage === 'send-outreach') {
          if (job.leadId != null) {
            const site = await db.query.generatedSites.findFirst({
              where: eq(generatedSites.leadId, job.leadId),
            });
            if (site) {
              await enqueueStage(queues, job.stage as JobStage, { siteId: site.id });
            }
          }
        }
        tick.stuckJobsResurrected++;
      } catch (err) {
        logger.warn({ err: (err as Error).message, jobId: job.id, stage: job.stage }, 'failed to resurrect stuck job');
      }
    }
  }

  // 1b) Scraped leads with no generate-content pipeline row.
  const scrapedLeads = await leadsMissingPipelineRow('scraped', 'generate-content');
  for (const lead of scrapedLeads) {
    try {
      await ensurePipelineRow(lead.id, 'generate-content');
      await enqueueStage(queues, 'generate-content', { leadId: lead.id });
      tick.scrapedLeadsKicked++;
    } catch (err) {
      logger.warn({ err: (err as Error).message, leadId: lead.id }, 'failed to kick scraped lead');
    }
  }

  // 2) Enriched leads with no generate-content pipeline row.
  const enrichedLeads = await leadsMissingPipelineRow('enriched', 'generate-content');
  for (const lead of enrichedLeads) {
    try {
      await ensurePipelineRow(lead.id, 'generate-content');
      await enqueueStage(queues, 'generate-content', { leadId: lead.id });
      tick.enrichedLeadsKicked++;
    } catch (err) {
      logger.warn({ err: (err as Error).message, leadId: lead.id }, 'failed to kick enriched lead');
    }
  }

  // 3) content-ready sites with no build-site pipeline row.
  const contentReadySites = await sitesMissingPipelineRow('content-ready', 'build-site');
  for (const site of contentReadySites) {
    try {
      if (site.leadId != null) {
        await ensurePipelineRow(site.leadId, 'build-site');
      }
      await enqueueStage(queues, 'build-site', { siteId: site.id });
      tick.contentReadySitesKicked++;
    } catch (err) {
      logger.warn({ err: (err as Error).message, siteId: site.id }, 'failed to kick content-ready site');
    }
  }

  // 4) deployed sites with no send-outreach pipeline row.
  const deployedSites = await sitesMissingPipelineRow('deployed', 'send-outreach');
  for (const site of deployedSites) {
    try {
      if (site.leadId != null) {
        await ensurePipelineRow(site.leadId, 'send-outreach');
      }
      await enqueueStage(queues, 'send-outreach', { siteId: site.id });
      tick.deployedSitesKicked++;
    } catch (err) {
      logger.warn({ err: (err as Error).message, siteId: site.id }, 'failed to kick deployed site');
    }
  }

  return tick;
}

export function startScheduler(queues: Queues): SchedulerHandle {
  let running = false;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const tick = async (): Promise<SchedulerTick | null> => {
    if (running) {
      logger.debug('scheduler tick already in progress, skipping');
      return null;
    }
    running = true;
    try {
      const result = await runTick(queues);
      if (
        result.stuckJobsResurrected ||
        result.scrapedLeadsKicked ||
        result.enrichedLeadsKicked ||
        result.contentReadySitesKicked ||
        result.deployedSitesKicked
      ) {
        logger.info({ tick: result }, 'scheduler tick complete');
      } else {
        logger.debug('scheduler tick complete (no work)');
      }
      return result;
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'scheduler tick failed');
      return null;
    } finally {
      running = false;
    }
  };

  const loop = (): void => {
    if (stopped) return;
    void tick();
    timer = setTimeout(loop, config.SCHEDULER_INTERVAL_MS);
  };

  // Kick off first tick after a short delay to let the rest of the boot finish.
  timer = setTimeout(loop, 5_000);
  logger.info(
    { intervalMs: config.SCHEDULER_INTERVAL_MS, stuckTimeoutMs: config.STUCK_JOB_TIMEOUT_MS },
    'scheduler started',
  );

  return {
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearTimeout(timer);
      // Allow any in-flight tick to finish.
      let waited = 0;
      while (running && waited < 5_000) {
        await new Promise((r) => setTimeout(r, 100));
        waited += 100;
      }
      logger.info('scheduler stopped');
    },
    runOnce: async () => {
      const result = await tick();
      return result ?? {
        stuckJobsResurrected: 0,
        scrapedLeadsKicked: 0,
        enrichedLeadsKicked: 0,
        contentReadySitesKicked: 0,
        deployedSitesKicked: 0,
      };
    },
  };
}

// Exported for unit tests.
export const __internal = { runTick, findStuckRunningJobs };
