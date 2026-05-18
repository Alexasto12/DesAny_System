import { writeFileSync, unlinkSync } from 'node:fs';
import IORedis from 'ioredis';
import { Queue, Worker, type Job } from 'bullmq';
import type { ScrapeJobPayload } from '@desany/types';
import { config } from './config.js';
import { logger } from './logger.js';
import { selectStrategy } from './strategies/index.js';
import { enrichEmail } from './enrichment/email.js';
import { upsertLead, markLeadFailed } from './db/upsert.js';
import {
  startPipelineJob,
  completePipelineJob,
  failPipelineJob,
} from './db/pipelineJobs.js';

const HEALTHCHECK_PATH = '/tmp/healthy';

function writeHealthcheck(): void {
  try {
    writeFileSync(HEALTHCHECK_PATH, String(Date.now()));
  } catch (err) {
    logger.warn({ err }, 'failed to write healthcheck file');
  }
}

function removeHealthcheck(): void {
  try {
    unlinkSync(HEALTHCHECK_PATH);
  } catch {
    // ignore - file may not exist
  }
}

writeHealthcheck();

const connection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

connection.on('error', (err) => {
  logger.warn({ err: err.message }, 'redis connection error (auto-reconnecting)');
});
connection.on('reconnecting', () => {
  logger.info('redis reconnecting');
});
connection.on('ready', () => {
  logger.info('redis ready');
});

const generateContentQueue = new Queue('generate-content', { connection });

async function processScrapeJob(job: Job<ScrapeJobPayload>): Promise<{
  scraped: number;
  upserted: number;
  failed: number;
}> {
  const { category, city, limit } = job.data;
  const jobLogger = logger.child({
    bullJobId: job.id,
    category,
    city,
    limit,
    strategy: config.SCRAPER_STRATEGY,
  });

  jobLogger.info('scrape job received');

  const pipelineJobId = await startPipelineJob('scrape');
  jobLogger.info({ pipelineJobId }, 'pipeline job created');

  try {
    const strategy = selectStrategy();
    const businesses = await strategy.scrape({ category, city, limit });
    jobLogger.info({ count: businesses.length }, 'businesses scraped');

    let upserted = 0;
    let failed = 0;

    for (const biz of businesses) {
      try {
        const email = biz.website
          ? await enrichEmail(biz.website, { logger: jobLogger })
          : null;

        const result = await upsertLead({
          source: 'google_maps',
          businessName: biz.name,
          category: biz.category || category,
          city,
          phone: biz.phone ?? null,
          website: biz.website ?? null,
          email,
          rawData: {
            ...biz.rawData,
            address: biz.address ?? null,
            reviews: biz.reviews ?? [],
            scraperStrategy: config.SCRAPER_STRATEGY,
          },
          status: 'scraped',
        });

        upserted++;
        jobLogger.debug(
          { leadId: result.id, created: result.created, businessName: biz.name },
          'lead upserted',
        );

        await generateContentQueue.add(
          'generate-content',
          { leadId: result.id },
          {
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 100 },
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );
      } catch (err) {
        failed++;
        jobLogger.error(
          { err, businessName: biz.name },
          'failed to upsert lead',
        );
        await markLeadFailed(biz.name, city).catch((markErr) => {
          jobLogger.warn({ markErr }, 'failed to mark lead failed');
        });
      }
    }

    await completePipelineJob(pipelineJobId);
    jobLogger.info(
      { scraped: businesses.length, upserted, failed, pipelineJobId },
      'scrape job completed',
    );

    return { scraped: businesses.length, upserted, failed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    jobLogger.error({ err, pipelineJobId }, 'scrape job failed');
    await failPipelineJob(pipelineJobId, message).catch((failErr) => {
      jobLogger.error({ failErr }, 'failed to record pipeline job failure');
    });
    throw err;
  }
}

const worker = new Worker<ScrapeJobPayload>('scrape', processScrapeJob, {
  connection,
  concurrency: config.WORKER_CONCURRENCY,
});

worker.on('ready', () => {
  logger.info(
    { concurrency: config.WORKER_CONCURRENCY, strategy: config.SCRAPER_STRATEGY },
    'scraper worker ready',
  );
});
worker.on('error', (err) => {
  logger.error({ err }, 'worker error');
});
worker.on('failed', (job, err) => {
  logger.error(
    { bullJobId: job?.id, err: err.message },
    'job failed',
  );
});
worker.on('completed', (job) => {
  logger.info({ bullJobId: job.id }, 'job completed');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  removeHealthcheck();
  try {
    await worker.close();
    await generateContentQueue.close();
    await connection.quit();
  } catch (err) {
    logger.error({ err }, 'error during shutdown');
  }
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  removeHealthcheck();
  process.exit(1);
});
