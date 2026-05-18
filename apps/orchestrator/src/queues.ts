import IORedis from 'ioredis';
import { Queue, QueueEvents } from 'bullmq';
import type { JobStage } from '@desany/types';
import { config } from './config.js';
import { logger } from './logger.js';
import { QUEUE_NAMES, STAGES } from './stateMachine.js';

export interface Queues {
  connection: IORedis;
  queues: Record<JobStage, Queue>;
  close: () => Promise<void>;
}

export function buildConnection(): IORedis {
  const conn = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  conn.on('error', (err: Error) => {
    logger.warn({ err: err.message }, 'redis connection error (auto-reconnecting)');
  });
  conn.on('reconnecting', () => {
    logger.info('redis reconnecting');
  });
  return conn;
}

export function buildQueues(connection?: IORedis): Queues {
  const conn = connection ?? buildConnection();
  const queues = Object.fromEntries(
    STAGES.map((stage) => [stage, new Queue(QUEUE_NAMES[stage], { connection: conn })]),
  ) as Record<JobStage, Queue>;

  return {
    connection: conn,
    queues,
    async close(): Promise<void> {
      await Promise.all(Object.values(queues).map((q) => q.close().catch(() => {})));
      conn.disconnect();
    },
  };
}

const DEFAULT_JOB_OPTS = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 100 },
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
};

export async function enqueueStage<P>(
  queues: Queues,
  stage: JobStage,
  payload: P,
  opts?: { jobId?: string; delay?: number },
): Promise<string> {
  const queue = queues.queues[stage];
  const job = await queue.add(QUEUE_NAMES[stage], payload as object, {
    ...DEFAULT_JOB_OPTS,
    ...(opts?.jobId ? { jobId: opts.jobId } : {}),
    ...(opts?.delay !== undefined ? { delay: opts.delay } : {}),
  });
  if (job.id == null) {
    throw new Error('BullMQ returned a job without an id');
  }
  return job.id;
}

export interface QueueDepth {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

export async function getQueueDepths(
  queues: Queues,
): Promise<Record<JobStage, QueueDepth>> {
  const entries = await Promise.all(
    STAGES.map(async (stage) => {
      const q = queues.queues[stage];
      const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
      const depth: QueueDepth = {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0,
      };
      return [stage, depth] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<JobStage, QueueDepth>;
}

export type { QueueEvents };
