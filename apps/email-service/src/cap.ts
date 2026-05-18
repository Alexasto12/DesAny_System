import { db, outreachMessages } from '@desany/db';
import { and, gte, sql } from 'drizzle-orm';
import { config } from './config.js';

export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0,
  ));
}

export function nextUtcMidnight(now: Date = new Date()): Date {
  const start = startOfUtcDay(now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function msUntilNextUtcMidnight(now: Date = new Date()): number {
  return nextUtcMidnight(now).getTime() - now.getTime();
}

export interface CapCheckResult {
  sentToday: number;
  cap: number;
  capReached: boolean;
  msUntilReset: number;
}

export async function getDailyCapStatus(now: Date = new Date()): Promise<CapCheckResult> {
  const start = startOfUtcDay(now);

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(outreachMessages)
    .where(and(
      gte(outreachMessages.sentAt, start),
      sql`${outreachMessages.status} = 'sent'`,
    ));

  const sentToday = rows[0]?.count ?? 0;
  const cap = config.EMAIL_DAILY_CAP;

  return {
    sentToday,
    cap,
    capReached: sentToday >= cap,
    msUntilReset: msUntilNextUtcMidnight(now),
  };
}
