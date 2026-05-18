import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.RESEND_API_KEY = 'test_key';
process.env.EMAIL_FROM = 'DesAny <hola@desany.dev>';
process.env.TRACKING_BASE_URL = 'https://track.desany.dev';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.DATABASE_URL = 'postgresql://desany:desany@localhost:5432/desany';
process.env.EMAIL_DAILY_CAP = '5';

const mockCount = vi.fn<() => Promise<number>>();

vi.mock('@desany/db', () => {
  const where = vi.fn(async () => [{ count: await mockCount() }]);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return {
    db: { select },
    outreachMessages: {
      sentAt: { name: 'sent_at' },
      status: { name: 'status' },
    },
  };
});

import {
  startOfUtcDay,
  nextUtcMidnight,
  msUntilNextUtcMidnight,
  getDailyCapStatus,
} from '../cap.js';

describe('startOfUtcDay', () => {
  it('returns midnight UTC of the given day', () => {
    const ref = new Date('2026-05-18T14:32:11.500Z');
    const start = startOfUtcDay(ref);
    expect(start.toISOString()).toBe('2026-05-18T00:00:00.000Z');
  });

  it('handles values exactly at midnight', () => {
    const ref = new Date('2026-05-18T00:00:00.000Z');
    expect(startOfUtcDay(ref).toISOString()).toBe('2026-05-18T00:00:00.000Z');
  });
});

describe('nextUtcMidnight & msUntilNextUtcMidnight', () => {
  it('returns the following UTC midnight', () => {
    const ref = new Date('2026-05-18T14:00:00.000Z');
    expect(nextUtcMidnight(ref).toISOString()).toBe('2026-05-19T00:00:00.000Z');
  });

  it('computes ms remaining in the UTC day', () => {
    const ref = new Date('2026-05-18T23:59:59.000Z');
    expect(msUntilNextUtcMidnight(ref)).toBe(1000);
  });
});

describe('getDailyCapStatus', () => {
  beforeEach(() => {
    mockCount.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports capReached=false when sentToday < cap', async () => {
    mockCount.mockResolvedValueOnce(2);
    const result = await getDailyCapStatus(new Date('2026-05-18T12:00:00Z'));
    expect(result.sentToday).toBe(2);
    expect(result.cap).toBe(5);
    expect(result.capReached).toBe(false);
    expect(result.msUntilReset).toBeGreaterThan(0);
  });

  it('reports capReached=true when sentToday equals cap', async () => {
    mockCount.mockResolvedValueOnce(5);
    const result = await getDailyCapStatus(new Date('2026-05-18T12:00:00Z'));
    expect(result.sentToday).toBe(5);
    expect(result.capReached).toBe(true);
  });

  it('reports capReached=true when sentToday exceeds cap', async () => {
    mockCount.mockResolvedValueOnce(99);
    const result = await getDailyCapStatus(new Date('2026-05-18T12:00:00Z'));
    expect(result.capReached).toBe(true);
  });

  it('msUntilReset is positive and within 24h', async () => {
    mockCount.mockResolvedValueOnce(0);
    const ref = new Date('2026-05-18T23:30:00Z');
    const result = await getDailyCapStatus(ref);
    expect(result.msUntilReset).toBeGreaterThan(0);
    expect(result.msUntilReset).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});
