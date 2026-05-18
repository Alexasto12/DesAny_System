import { db, leadEnrichments, leads } from '@desany/db';
import type { Lead, LeadEnrichment } from '@desany/types';
import { buildReviewSummaryPrompt } from '@desany/prompts';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { LlmClient } from './llm.js';
import { reviewSummarySchema, type ReviewSummary } from './schema.js';

interface RawReview {
  text?: string;
  rating?: number;
  author?: string;
}

function extractReviews(rawData: unknown): RawReview[] {
  if (!rawData || typeof rawData !== 'object') return [];
  const data = rawData as Record<string, unknown>;
  const candidate = data.reviews ?? data.topReviews ?? data.googleReviews;
  if (!Array.isArray(candidate)) return [];
  return candidate
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      text: typeof r.text === 'string' ? r.text : typeof r.snippet === 'string' ? r.snippet : undefined,
      rating: typeof r.rating === 'number' ? r.rating : undefined,
      author: typeof r.author === 'string' ? r.author : typeof r.authorName === 'string' ? r.authorName : undefined,
    }));
}

export async function ensureEnrichment(
  lead: Lead,
  llm: LlmClient,
  logger: Logger,
): Promise<LeadEnrichment> {
  const existing = await db.query.leadEnrichments.findFirst({
    where: eq(leadEnrichments.leadId, lead.id),
  });
  if (existing) {
    return existing as unknown as LeadEnrichment;
  }

  const reviews = extractReviews(lead.rawData).slice(0, 10);
  const reviewTexts = reviews.map((r) => r.text).filter((t): t is string => !!t);

  let summary: ReviewSummary;
  if (reviewTexts.length === 0) {
    logger.warn({ leadId: lead.id }, 'no reviews available for enrichment, using neutral defaults');
    summary = {
      services: ['general services'],
      tone: 'professional and approachable',
      palette: { primary: '#1e293b', secondary: '#475569', accent: '#f1f5f9' },
    };
  } else {
    const { system, user } = buildReviewSummaryPrompt(reviewTexts);
    summary = await llm.chatJSON({
      system,
      user,
      schema: reviewSummarySchema,
      promptName: 'review-summary',
    });
  }

  const topReviews = reviews
    .filter((r) => r.text)
    .slice(0, 10)
    .map((r) => ({
      text: r.text ?? '',
      rating: typeof r.rating === 'number' ? r.rating : 5,
      author: r.author ?? 'Anonymous',
    }));

  const [inserted] = await db
    .insert(leadEnrichments)
    .values({
      leadId: lead.id,
      topReviews,
      servicesInferred: summary.services,
      colorPaletteSuggestion: summary.palette,
    })
    .returning();

  await db.update(leads).set({ status: 'enriched' }).where(eq(leads.id, lead.id));

  logger.info(
    { leadId: lead.id, servicesCount: summary.services.length, tone: summary.tone },
    'enrichment created',
  );

  return {
    ...(inserted as unknown as LeadEnrichment),
    topReviews,
    servicesInferred: summary.services,
    colorPaletteSuggestion: summary.palette,
  };
}

export function inferToneHint(enrichment: LeadEnrichment): string | undefined {
  const services = enrichment.servicesInferred;
  if (services.length === 0) return undefined;
  return `inferred services include: ${services.slice(0, 5).join(', ')}`;
}
