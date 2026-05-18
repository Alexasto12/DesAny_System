import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Mock @desany/db before anything imports it.
const fakeDb = {
  query: {
    leads: { findFirst: vi.fn() },
    leadEnrichments: { findFirst: vi.fn() },
    generatedSites: { findFirst: vi.fn() },
    pipelineJobs: { findFirst: vi.fn() },
  },
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  execute: vi.fn(),
};

vi.mock('@desany/db', () => ({
  db: fakeDb,
  leads: { id: { name: 'id' }, status: { name: 'status' } },
  leadEnrichments: { leadId: { name: 'lead_id' } },
  generatedSites: { id: { name: 'id' }, leadId: { name: 'lead_id' }, status: { name: 'status' } },
  outreachMessages: { id: { name: 'id' }, leadId: { name: 'lead_id' }, status: { name: 'status' }, sentAt: { name: 'sent_at' } },
  pipelineJobs: {
    id: { name: 'id' },
    leadId: { name: 'lead_id' },
    stage: { name: 'stage' },
    status: { name: 'status' },
    updatedAt: { name: 'updated_at' },
  },
}));

const { buildServer } = await import('../server.js');

interface FakeJob {
  id: string;
  data: Record<string, unknown>;
  timestamp: number;
  attemptsMade: number;
  failedReason: string | null;
  finishedOn: number | null;
  processedOn: number | null;
  getState: () => Promise<string>;
}

function makeFakeQueue(): {
  add: ReturnType<typeof vi.fn>;
  getJob: ReturnType<typeof vi.fn>;
  getJobCounts: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  return {
    add: vi.fn(),
    getJob: vi.fn(),
    getJobCounts: vi.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function buildFakeQueues(): { close: () => Promise<void>; queues: Record<string, ReturnType<typeof makeFakeQueue>>; connection: { disconnect: () => void } } {
  const queues = {
    scrape: makeFakeQueue(),
    enrich: makeFakeQueue(),
    'generate-content': makeFakeQueue(),
    'build-site': makeFakeQueue(),
    'send-outreach': makeFakeQueue(),
  };
  return {
    queues,
    connection: { disconnect: vi.fn() },
    close: async () => {},
  };
}

describe('orchestrator HTTP API', () => {
  let app: FastifyInstance;
  let fakeQueues: ReturnType<typeof buildFakeQueues>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fakeQueues = buildFakeQueues();
    app = await buildServer({ queues: fakeQueues as never });
  });

  it('GET /health returns 200 ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'orchestrator' });
  });

  it('POST /campaigns validates the body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns',
      payload: { city: 'Los Angeles' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('POST /campaigns enqueues a scrape job and returns the id', async () => {
    fakeQueues.queues.scrape.add.mockResolvedValue({ id: 'sjob-1' });

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns',
      payload: { category: 'hair salons', city: 'Los Angeles', limit: 10 },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      campaignId: 'sjob-1',
      jobId: 'sjob-1',
      category: 'hair salons',
      city: 'Los Angeles',
      limit: 10,
    });
    expect(fakeQueues.queues.scrape.add).toHaveBeenCalledTimes(1);
    const [name, payload] = fakeQueues.queues.scrape.add.mock.calls[0];
    expect(name).toBe('scrape');
    expect(payload).toEqual({ category: 'hair salons', city: 'Los Angeles', limit: 10 });
  });

  it('GET /campaigns/:id returns 404 when no scrape job exists', async () => {
    fakeQueues.queues.scrape.getJob.mockResolvedValue(undefined);

    const res = await app.inject({ method: 'GET', url: '/campaigns/missing' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'campaign_not_found' });
  });

  it('GET /campaigns/:id returns aggregate status', async () => {
    const fakeJob: FakeJob = {
      id: 'sjob-1',
      data: { category: 'hair salons', city: 'Los Angeles', limit: 10 },
      timestamp: Date.now(),
      attemptsMade: 1,
      failedReason: null,
      finishedOn: Date.now(),
      processedOn: Date.now() - 1000,
      getState: vi.fn().mockResolvedValue('completed'),
    };
    fakeQueues.queues.scrape.getJob.mockResolvedValue(fakeJob);

    // db.select() chain returns leads, then site counts, then outreach counts, then pipeline counts.
    const fakeFrom = {
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
    };
    let selectCall = 0;
    fakeDb.select.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) {
          // leads list
          return {
            where: () =>
              Promise.resolve([
                { id: 1, status: 'enriched' },
                { id: 2, status: 'enriched' },
                { id: 3, status: 'failed' },
              ]),
          };
        }
        if (selectCall === 2) {
          // generated_sites counts
          return {
            where: () => ({
              groupBy: () => Promise.resolve([{ status: 'deployed', count: 2 }]),
            }),
          };
        }
        if (selectCall === 3) {
          // outreach counts
          return {
            where: () => ({
              groupBy: () => Promise.resolve([{ status: 'sent', count: 2 }]),
            }),
          };
        }
        // pipeline counts
        return {
          where: () => ({
            groupBy: () =>
              Promise.resolve([{ stage: 'generate-content', status: 'completed', count: 2 }]),
          }),
        };
      }),
      ...fakeFrom,
    }));

    const res = await app.inject({ method: 'GET', url: '/campaigns/sjob-1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      campaignId: 'sjob-1',
      category: 'hair salons',
      city: 'Los Angeles',
      limit: 10,
      scrape: { jobId: 'sjob-1', state: 'completed' },
      totals: {
        leadsScraped: 3,
        leadsEnriched: 2,
        deployed: 2,
        contacted: 2,
      },
    });
    expect(body.totals.failed).toBeGreaterThanOrEqual(1);
  });

  it('GET /leads paginates with optional status filter', async () => {
    fakeDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: () =>
                Promise.resolve([
                  {
                    id: 1,
                    businessName: 'Test Salon',
                    category: 'hair salons',
                    city: 'LA',
                    email: null,
                    phone: null,
                    website: null,
                    status: 'enriched',
                    scrapedAt: new Date(),
                  },
                ]),
            }),
          }),
        }),
      }),
    }));
    fakeDb.execute.mockResolvedValue({
      rows: [{ leadId: 1, stage: 'generate-content', status: 'completed', updatedAt: new Date() }],
    });
    // For the total-count query, the next .select returns the count row.
    fakeDb.select.mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: () =>
                Promise.resolve([
                  {
                    id: 1,
                    businessName: 'Test Salon',
                    category: 'hair salons',
                    city: 'LA',
                    email: null,
                    phone: null,
                    website: null,
                    status: 'enriched',
                    scrapedAt: new Date(),
                  },
                ]),
            }),
          }),
        }),
      }),
    })).mockImplementationOnce(() => ({
      from: () => ({
        where: () => Promise.resolve([{ count: 1 }]),
      }),
    }));

    const res = await app.inject({ method: 'GET', url: '/leads?status=enriched&limit=10&offset=0' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination).toMatchObject({ limit: 10, offset: 0, total: 1 });
    expect(body.leads).toHaveLength(1);
    expect(body.leads[0]).toMatchObject({
      id: 1,
      businessName: 'Test Salon',
      currentStage: 'generate-content',
      currentStageStatus: 'completed',
    });
  });

  it('GET /leads/:id returns 400 on non-numeric id', async () => {
    const res = await app.inject({ method: 'GET', url: '/leads/abc' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_id' });
  });

  it('GET /leads/:id returns 404 when missing', async () => {
    fakeDb.query.leads.findFirst.mockResolvedValue(undefined);
    const res = await app.inject({ method: 'GET', url: '/leads/42' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /leads/:id returns the full bundle when present', async () => {
    const lead = {
      id: 42,
      businessName: 'Acme',
      category: 'pizza',
      city: 'NYC',
      status: 'enriched',
    };
    fakeDb.query.leads.findFirst.mockResolvedValue(lead);
    fakeDb.query.leadEnrichments.findFirst.mockResolvedValue({ id: 1, leadId: 42, topReviews: [] });

    let selectCalls = 0;
    fakeDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          orderBy: () => {
            selectCalls++;
            if (selectCalls === 1) return Promise.resolve([{ id: 7, leadId: 42, status: 'deployed' }]);
            if (selectCalls === 2) return Promise.resolve([{ id: 1, leadId: 42, status: 'sent' }]);
            return Promise.resolve([{ id: 9, leadId: 42, stage: 'send-outreach', status: 'completed' }]);
          },
        }),
      }),
    }));

    const res = await app.inject({ method: 'GET', url: '/leads/42' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.lead).toMatchObject({ id: 42, businessName: 'Acme' });
    expect(body.enrichment).toMatchObject({ leadId: 42 });
    expect(body.sites).toHaveLength(1);
    expect(body.outreach).toHaveLength(1);
    expect(body.pipeline).toHaveLength(1);
  });

  it('POST /leads/:id/retry returns 404 for missing lead', async () => {
    fakeDb.query.leads.findFirst.mockResolvedValue(undefined);
    const res = await app.inject({ method: 'POST', url: '/leads/99/retry' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /leads/:id/retry returns 409 when there is no failed job', async () => {
    fakeDb.query.leads.findFirst.mockResolvedValue({ id: 5 });
    fakeDb.query.pipelineJobs.findFirst.mockResolvedValue(undefined);
    const res = await app.inject({ method: 'POST', url: '/leads/5/retry' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'no_failed_job' });
  });

  it('POST /leads/:id/retry re-enqueues a generate-content failure', async () => {
    fakeDb.query.leads.findFirst.mockResolvedValue({ id: 5 });
    fakeDb.query.pipelineJobs.findFirst.mockResolvedValue({
      id: 88,
      leadId: 5,
      stage: 'generate-content',
      status: 'failed',
    });
    fakeDb.update.mockReturnValue({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    });
    fakeQueues.queues['generate-content'].add.mockResolvedValue({ id: 'gjob-7' });

    const res = await app.inject({ method: 'POST', url: '/leads/5/retry' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      leadId: 5,
      retriedStage: 'generate-content',
      jobId: 'gjob-7',
    });
    expect(fakeQueues.queues['generate-content'].add).toHaveBeenCalledWith(
      'generate-content',
      { leadId: 5 },
      expect.any(Object),
    );
  });

  it('POST /leads/:id/retry uses siteId payload for build-site stage', async () => {
    fakeDb.query.leads.findFirst.mockResolvedValue({ id: 5 });
    fakeDb.query.pipelineJobs.findFirst.mockResolvedValue({
      id: 88,
      leadId: 5,
      stage: 'build-site',
      status: 'failed',
    });
    fakeDb.query.generatedSites.findFirst.mockResolvedValue({ id: 12, leadId: 5 });
    fakeDb.update.mockReturnValue({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    });
    fakeQueues.queues['build-site'].add.mockResolvedValue({ id: 'bjob-1' });

    const res = await app.inject({ method: 'POST', url: '/leads/5/retry' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      retriedStage: 'build-site',
      jobId: 'bjob-1',
    });
    expect(fakeQueues.queues['build-site'].add).toHaveBeenCalledWith(
      'build-site',
      { siteId: 12 },
      expect.any(Object),
    );
  });

  it('GET /metrics returns queue depths and throughput', async () => {
    fakeDb.execute.mockResolvedValue({
      rows: [
        { stage: 'scrape', status: 'completed', count: 5 },
        { stage: 'scrape', status: 'failed', count: 1 },
        { stage: 'generate-content', status: 'completed', count: 3 },
      ],
    });
    fakeDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          groupBy: () => Promise.resolve([{ stage: 'scrape', count: 1 }]),
        }),
      }),
    }));
    // override for the simple-count queries (emails, deploys) at the end
    let sideMetricCall = 0;
    fakeDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => {
          sideMetricCall++;
          if (sideMetricCall === 1) {
            // errorCountsByStage uses .groupBy
            return {
              groupBy: () => Promise.resolve([{ stage: 'scrape', count: 1 }]),
            };
          }
          return Promise.resolve([{ count: sideMetricCall === 2 ? 7 : 4 }]);
        },
      }),
    }));

    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.queueDepths).toHaveProperty('scrape');
    expect(body.queueDepths.scrape).toMatchObject({ waiting: 0, active: 0 });
    expect(body.throughput24h.scrape).toMatchObject({ completed: 5, failed: 1, total: 6 });
    expect(body.throughput24h['generate-content']).toMatchObject({ completed: 3, total: 3 });
    expect(body.errorCounts).toMatchObject({ scrape: 1 });
  });
});
