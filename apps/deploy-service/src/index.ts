import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Worker, Queue, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { execa } from 'execa';
import { eq } from 'drizzle-orm';
import { db, leads, generatedSites, pipelineJobs } from '@desany/db';
import type { BuildSiteJobPayload, SendOutreachJobPayload } from '@desany/types';
import { loadConfig, type Config } from './config.js';
import { createLogger, type AppLogger } from './logger.js';
import { VercelClient } from './vercel.js';
import { collectFiles } from './files.js';
import { buildProjectName } from './slug.js';
import { sleep } from './retry.js';

const QUEUE_BUILD_SITE = 'build-site';
const QUEUE_SEND_OUTREACH = 'send-outreach';

const TERMINAL_FAIL_STATES = new Set(['ERROR', 'CANCELED']);
const TERMINAL_READY_STATES = new Set(['READY']);

async function processJob(
  job: Job<BuildSiteJobPayload>,
  ctx: { config: Config; logger: AppLogger; vercel: VercelClient; outreachQueue: Queue },
): Promise<void> {
  const { siteId } = job.data;
  const log = ctx.logger.child({ jobId: job.id, siteId });

  log.info('processing build-site job');

  const site = await db.query.generatedSites.findFirst({
    where: eq(generatedSites.id, siteId),
  });

  if (!site) {
    throw new Error(`generated_sites row not found for siteId=${siteId}`);
  }
  if (site.leadId == null) {
    throw new Error(`generated_sites row ${siteId} has no leadId`);
  }

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, site.leadId),
  });

  if (!lead) {
    throw new Error(`lead not found for leadId=${site.leadId}`);
  }

  const siteWorkDir = path.join(ctx.config.SITE_WORK_DIR, String(siteId));
  const contentPath = path.join(siteWorkDir, 'content.json');
  const buildPath = path.join(siteWorkDir, 'build');

  await fs.mkdir(siteWorkDir, { recursive: true });
  await fs.writeFile(contentPath, JSON.stringify(site.contentJson, null, 2), 'utf8');
  log.info({ contentPath }, 'wrote content.json');

  const variant = site.templateVariant ?? 'modern';
  await runGenerateSite({
    config: ctx.config,
    logger: log,
    contentPath,
    outputPath: buildPath,
    variant,
  });

  const projectName = buildProjectName(lead.businessName, lead.city, siteId);
  log.info({ projectName }, 'creating vercel project');
  const project = await ctx.vercel.createProject(projectName);

  log.info({ projectId: project.id }, 'collecting build files');
  const files = await collectFiles(buildPath);
  if (files.length === 0) {
    throw new Error(`build output at ${buildPath} is empty`);
  }

  log.info({ projectId: project.id, fileCount: files.length }, 'creating deployment');
  const deployment = await ctx.vercel.createDeployment(project.id, files);

  log.info({ deploymentId: deployment.id, url: deployment.url }, 'polling deployment status');
  const finalUrl = await pollUntilReady({
    vercel: ctx.vercel,
    logger: log,
    deploymentId: deployment.id,
    timeoutMs: ctx.config.DEPLOY_TIMEOUT_MS,
    intervalMs: ctx.config.DEPLOY_POLL_INTERVAL_MS,
  });

  await db
    .update(generatedSites)
    .set({
      vercelUrl: finalUrl,
      vercelProjectId: project.id,
      status: 'deployed',
      deployedAt: new Date(),
      localPath: buildPath,
    })
    .where(eq(generatedSites.id, siteId));

  await markPipelineJobCompleted(site.leadId, log);

  const payload: SendOutreachJobPayload = { siteId };
  await ctx.outreachQueue.add(QUEUE_SEND_OUTREACH, payload, {
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });

  log.info({ vercelUrl: finalUrl, projectId: project.id }, 'deploy complete, enqueued outreach');
}

async function runGenerateSite(args: {
  config: Config;
  logger: AppLogger;
  contentPath: string;
  outputPath: string;
  variant: string;
}): Promise<void> {
  const { config, logger, contentPath, outputPath, variant } = args;
  const cmd = 'pnpm';
  const cmdArgs = [
    'tsx',
    config.TEMPLATE_SCRIPT_PATH,
    '--content',
    contentPath,
    '--output',
    outputPath,
    '--variant',
    variant,
  ];

  logger.info({ cmd, args: cmdArgs, cwd: config.MONOREPO_ROOT }, 'invoking generate-site');

  const result = await execa(cmd, cmdArgs, {
    cwd: config.MONOREPO_ROOT,
    reject: false,
    all: true,
  });

  if (result.exitCode !== 0) {
    logger.error(
      { exitCode: result.exitCode, stderr: result.stderr, stdout: result.stdout },
      'generate-site failed',
    );
    throw new Error(`generate-site failed with exit code ${result.exitCode}`);
  }

  logger.info({ outputPath }, 'generate-site completed');
}

async function pollUntilReady(args: {
  vercel: VercelClient;
  logger: AppLogger;
  deploymentId: string;
  timeoutMs: number;
  intervalMs: number;
}): Promise<string> {
  const { vercel, logger, deploymentId, timeoutMs, intervalMs } = args;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await vercel.getDeployment(deploymentId);
    logger.debug({ deploymentId, readyState: status.readyState }, 'deployment status');

    if (TERMINAL_READY_STATES.has(status.readyState)) {
      const url = status.url.startsWith('http') ? status.url : `https://${status.url}`;
      return url;
    }

    if (TERMINAL_FAIL_STATES.has(status.readyState)) {
      throw new Error(`Deployment ${deploymentId} entered terminal state ${status.readyState}`);
    }

    await sleep(intervalMs);
  }

  throw new Error(`Deployment ${deploymentId} did not become READY within ${timeoutMs}ms`);
}

async function markPipelineJobCompleted(leadId: number, logger: AppLogger): Promise<void> {
  try {
    await db
      .update(pipelineJobs)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(pipelineJobs.leadId, leadId));
  } catch (err) {
    logger.warn({ err, leadId }, 'failed to mark pipeline job completed');
  }
}

async function handleFailure(
  job: Job<BuildSiteJobPayload>,
  err: unknown,
  logger: AppLogger,
): Promise<void> {
  const siteId = job.data.siteId;
  const message = err instanceof Error ? err.message : String(err);

  logger.error({ jobId: job.id, siteId, err: message }, 'build-site job failed');

  try {
    const site = await db.query.generatedSites.findFirst({
      where: eq(generatedSites.id, siteId),
    });
    if (site) {
      await db
        .update(generatedSites)
        .set({ status: 'deploy-failed' })
        .where(eq(generatedSites.id, siteId));

      if (site.leadId != null) {
        await db
          .update(pipelineJobs)
          .set({ status: 'failed', lastError: message, updatedAt: new Date() })
          .where(eq(pipelineJobs.leadId, site.leadId));
      }
    }
  } catch (innerErr) {
    logger.error({ innerErr, siteId }, 'failed to record deploy-failed state');
  }
}

export interface StartWorkerOptions {
  config?: Config;
  logger?: AppLogger;
}

export async function startWorker(options: StartWorkerOptions = {}): Promise<{
  worker: Worker<BuildSiteJobPayload>;
  outreachQueue: Queue;
  shutdown: () => Promise<void>;
}> {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.LOG_LEVEL);

  const connection = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const outreachQueue = new Queue(QUEUE_SEND_OUTREACH, { connection });

  const vercel = new VercelClient({
    token: config.VERCEL_TOKEN,
    teamId: config.VERCEL_TEAM_ID,
    logger,
  });

  const worker = new Worker<BuildSiteJobPayload>(
    QUEUE_BUILD_SITE,
    async (job) => {
      try {
        await processJob(job, { config, logger, vercel, outreachQueue });
      } catch (err) {
        await handleFailure(job, err, logger);
        throw err;
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, siteId: job.data.siteId }, 'build-site job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, siteId: job?.data.siteId, err: err.message },
      'build-site worker reported failure',
    );
  });

  logger.info({ queue: QUEUE_BUILD_SITE }, 'deploy-service worker started');

  const shutdown = async () => {
    logger.info('shutting down deploy-service');
    await worker.close();
    await outreachQueue.close();
    await connection.quit();
  };

  return { worker, outreachQueue, shutdown };
}

const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
  startWorker().then(({ shutdown }) => {
    const stop = async (signal: string) => {
      process.stderr.write(`received ${signal}, shutting down\n`);
      await shutdown();
      process.exit(0);
    };
    process.on('SIGTERM', () => void stop('SIGTERM'));
    process.on('SIGINT', () => void stop('SIGINT'));
  }).catch((err) => {
    process.stderr.write(`failed to start deploy-service: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
}

export type { Config };
