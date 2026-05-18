import { Worker, Queue, type Job } from 'bullmq';
import IORedis from 'ioredis';
import pino from 'pino';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, leads, generatedSites, pipelineJobs } from '@desany/db';
import type { GenerateContentJobPayload, Lead, LeadEnrichment, LandingContent } from '@desany/types';
import { buildLandingContentPrompt, PROMPT_VERSION } from '@desany/prompts';
import { LlmClient } from './llm.js';
import { landingContentSchema, parseLandingContent } from './schema.js';
import { ensureEnrichment, inferToneHint } from './enrichment.js';

const configSchema = z.object({
  REDIS_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  LLM_BASE_URL: z.string().url(),
  LLM_MODEL_NAME: z.string().min(1),
  LLM_API_KEY: z.string().min(1).default('EMPTY'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  LOG_LEVEL: z.string().default('info'),
});

const config = configSchema.parse(process.env);

const logger = pino({ level: config.LOG_LEVEL, base: { service: 'content-gen', promptVersion: PROMPT_VERSION } });

const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

const buildSiteQueue = new Queue('build-site', { connection });

const llm = new LlmClient({
  baseURL: config.LLM_BASE_URL,
  model: config.LLM_MODEL_NAME,
  apiKey: config.LLM_API_KEY,
  timeoutMs: config.LLM_TIMEOUT_MS,
  maxJsonRetries: config.LLM_MAX_RETRIES,
  logger,
});

async function processJob(job: Job<GenerateContentJobPayload>): Promise<{ siteId: number }> {
  const { leadId } = job.data;
  const jobLogger = logger.child({ leadId, bullJobId: job.id });
  jobLogger.info('content-gen job received');

  const lead = (await db.query.leads.findFirst({ where: eq(leads.id, leadId) })) as Lead | undefined;
  if (!lead) {
    throw new Error(`lead ${leadId} not found`);
  }

  await markPipelineRunning(leadId);

  const enrichment: LeadEnrichment = await ensureEnrichment(lead, llm, jobLogger);

  const { system, user } = buildLandingContentPrompt({
    businessName: lead.businessName,
    category: lead.category,
    city: lead.city,
    phone: lead.phone ?? undefined,
    email: lead.email ?? undefined,
    address: typeof (lead.rawData as Record<string, unknown> | null)?.address === 'string'
      ? ((lead.rawData as Record<string, unknown>).address as string)
      : undefined,
    topReviews: enrichment.topReviews.slice(0, 5).map((r) => ({ text: r.text, rating: r.rating })),
    servicesInferred: enrichment.servicesInferred,
    toneHint: inferToneHint(enrichment),
  });

  const content = await llm.chatJSON({
    system,
    user,
    schema: landingContentSchema,
    promptName: 'landing-content',
  });

  const validated: LandingContent = parseLandingContent(content);

  const [site] = await db
    .insert(generatedSites)
    .values({
      leadId,
      contentJson: validated,
      templateVariant: validated.styleVariant,
      status: 'content-ready',
    })
    .returning();

  const siteId = site.id;
  jobLogger.info({ siteId, styleVariant: validated.styleVariant }, 'generated_site row created');

  await buildSiteQueue.add('build-site', { siteId });
  await markPipelineComplete(leadId);

  return { siteId };
}

async function markPipelineRunning(leadId: number): Promise<void> {
  const existing = await db.query.pipelineJobs.findFirst({
    where: eq(pipelineJobs.leadId, leadId),
  });
  if (existing && existing.stage === 'generate-content') {
    await db
      .update(pipelineJobs)
      .set({ status: 'running', attempts: (existing.attempts ?? 0) + 1, updatedAt: new Date() })
      .where(eq(pipelineJobs.id, existing.id));
  } else {
    await db.insert(pipelineJobs).values({
      leadId,
      stage: 'generate-content',
      status: 'running',
      attempts: 1,
    });
  }
}

async function markPipelineComplete(leadId: number): Promise<void> {
  await db
    .update(pipelineJobs)
    .set({ status: 'completed', lastError: null, updatedAt: new Date() })
    .where(eq(pipelineJobs.leadId, leadId));
}

async function markPipelineFailed(leadId: number, error: string): Promise<void> {
  await db
    .update(pipelineJobs)
    .set({ status: 'failed', lastError: error.slice(0, 1000), updatedAt: new Date() })
    .where(eq(pipelineJobs.leadId, leadId));
}

const worker = new Worker<GenerateContentJobPayload>(
  'generate-content',
  async (job) => {
    try {
      return await processJob(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ bullJobId: job.id, leadId: job.data.leadId, error: message }, 'content-gen job failed');
      await markPipelineFailed(job.data.leadId, message).catch((e) => {
        logger.error({ error: (e as Error).message }, 'failed to update pipeline_jobs after failure');
      });
      throw err;
    }
  },
  { connection, concurrency: 2 },
);

worker.on('completed', (job, result) => {
  logger.info({ bullJobId: job.id, leadId: job.data.leadId, result }, 'content-gen job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ bullJobId: job?.id, leadId: job?.data?.leadId, error: err.message }, 'content-gen job ultimately failed');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  await worker.close();
  await buildSiteQueue.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

logger.info({ queue: 'generate-content', model: config.LLM_MODEL_NAME }, 'content-gen worker ready');
