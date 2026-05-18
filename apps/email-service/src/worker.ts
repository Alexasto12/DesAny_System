import { Worker, Queue, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { eq } from 'drizzle-orm';
import { db, generatedSites, leads, outreachMessages } from '@desany/db';
import type { SendOutreachJobPayload } from '@desany/types';
import { config } from './config.js';
import { logger } from './logger.js';
import { getDailyCapStatus, msUntilNextUtcMidnight } from './cap.js';
import { appendTrackingPixel, pickSubject, renderBody, type Language } from './render.js';
import { sendEmail } from './resend.js';

const QUEUE_NAME = 'send-outreach';

function resolveLanguage(rawData: unknown): Language {
  if (rawData && typeof rawData === 'object') {
    const lang = (rawData as Record<string, unknown>).language;
    if (lang === 'en' || lang === 'es') return lang;
  }
  return config.EMAIL_LANGUAGE;
}

async function insertOutreach(args: {
  leadId: number;
  siteId: number;
  emailTo: string;
  subject: string;
  body: string;
  status: 'pending' | 'no-email';
  sentAt: Date | null;
}): Promise<number> {
  const [row] = await db
    .insert(outreachMessages)
    .values({
      leadId: args.leadId,
      siteId: args.siteId,
      emailTo: args.emailTo,
      subject: args.subject,
      body: args.body,
      status: args.status,
      sentAt: args.sentAt,
    })
    .returning({ id: outreachMessages.id });
  return row.id;
}

async function buildTrackingUrl(outreachId: number): Promise<string> {
  const base = config.TRACKING_BASE_URL.replace(/\/+$/, '');
  return `${base}/track/open/${outreachId}`;
}

export async function processSendOutreach(
  job: Job<SendOutreachJobPayload>,
  queue: Queue<SendOutreachJobPayload>,
): Promise<{ status: 'sent' | 'no-email' | 'requeued'; outreachId?: number }> {
  const { siteId } = job.data;
  const jobLog = logger.child({ jobId: job.id, siteId });

  const site = await db.query.generatedSites.findFirst({
    where: eq(generatedSites.id, siteId),
  });
  if (!site) {
    throw new Error(`generated_site not found: ${siteId}`);
  }
  if (!site.leadId) {
    throw new Error(`generated_site ${siteId} has no leadId`);
  }

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, site.leadId) });
  if (!lead) {
    throw new Error(`lead not found for site ${siteId}: leadId=${site.leadId}`);
  }

  if (!lead.email) {
    const id = await insertOutreach({
      leadId: lead.id,
      siteId: site.id,
      emailTo: '',
      subject: '',
      body: '',
      status: 'no-email',
      sentAt: null,
    });
    jobLog.info({ outreachId: id, leadId: lead.id }, 'lead has no email, marked no-email');
    return { status: 'no-email', outreachId: id };
  }

  const cap = await getDailyCapStatus();
  if (cap.capReached) {
    const delay = Math.max(1_000, msUntilNextUtcMidnight());
    jobLog.warn(
      { sentToday: cap.sentToday, cap: cap.cap, delayMs: delay },
      'daily email cap reached, requeueing for next UTC day',
    );
    await queue.add(job.name, job.data, { delay });
    return { status: 'requeued' };
  }

  if (!site.vercelUrl) {
    throw new Error(`site ${siteId} has no vercelUrl yet`);
  }

  const language = resolveLanguage(lead.rawData);
  const vars = {
    businessName: lead.businessName,
    city: lead.city,
    category: lead.category,
    siteUrl: site.vercelUrl,
    senderName: config.SENDER_NAME,
    senderTitle: config.SENDER_TITLE,
  };

  const subject = await pickSubject(language, vars);
  const body = await renderBody(language, vars);

  const outreachId = await insertOutreach({
    leadId: lead.id,
    siteId: site.id,
    emailTo: lead.email,
    subject,
    body,
    status: 'pending',
    sentAt: null,
  });

  const trackingUrl = await buildTrackingUrl(outreachId);
  const htmlWithPixel = appendTrackingPixel(body, trackingUrl);

  try {
    const result = await sendEmail({
      to: lead.email,
      subject,
      html: htmlWithPixel,
    });

    await db
      .update(outreachMessages)
      .set({ status: 'sent', sentAt: new Date(), body: htmlWithPixel })
      .where(eq(outreachMessages.id, outreachId));

    jobLog.info(
      { outreachId, resendId: result.id, language, subject },
      'outreach email sent',
    );
    return { status: 'sent', outreachId };
  } catch (err) {
    jobLog.error({ err, outreachId }, 'failed to send outreach email');
    throw err;
  }
}

export function startWorker(): { worker: Worker; queue: Queue; redis: IORedis } {
  const redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue<SendOutreachJobPayload>(QUEUE_NAME, { connection: redis });

  const worker = new Worker<SendOutreachJobPayload>(
    QUEUE_NAME,
    (job) => processSendOutreach(job, queue),
    {
      connection: redis,
      concurrency: 2,
    },
  );

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'send-outreach job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'send-outreach job failed');
  });
  worker.on('error', (err) => {
    logger.error({ err }, 'worker error');
  });

  logger.info({ queue: QUEUE_NAME }, 'email-service worker started');

  return { worker, queue, redis };
}
