import type { JobStage, Lead } from '@desany/types';

export const STAGES: readonly JobStage[] = [
  'scrape',
  'generate-content',
  'build-site',
  'send-outreach',
] as const;

export const QUEUE_NAMES: Record<JobStage, string> = {
  scrape: 'scrape',
  'generate-content': 'generate-content',
  'build-site': 'build-site',
  'send-outreach': 'send-outreach',
};

/**
 * Minimal lead-shaped object the state machine reasons about.
 * Real `Lead` objects from @desany/types match — the looser interface
 * keeps the state machine pure and testable without the DB.
 */
export interface LeadLike {
  email?: string | null;
  rawData?: unknown;
}

/**
 * Given the stage that just completed and the lead, return the next stage
 * to enqueue, or null if the pipeline terminates here.
 *
 * Legal transitions:
 *   scrape           → generate-content
 *   generate-content → build-site
 *   build-site       → send-outreach
 *   send-outreach    → null (terminal)
 *
 * `failed` is terminal-until-retry from any stage; callers handle retry
 * separately via `nextStageForRetry`.
 */
export function nextStage(currentStage: JobStage, _lead: LeadLike): JobStage | null {
  switch (currentStage) {
    case 'scrape':
      return 'generate-content';
    case 'generate-content':
      return 'build-site';
    case 'build-site':
      return 'send-outreach';
    case 'send-outreach':
      return null;
    default: {
      const _exhaustive: never = currentStage;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * Decide what stage to re-enqueue for retry. For a lead with a failed
 * pipeline_jobs row at stage X, restart that same stage.
 */
export function nextStageForRetry(failedStage: JobStage): JobStage {
  return failedStage;
}

/**
 * Map a `Lead.status` (the LeadStatus union) to the stage it would naturally
 * be sitting at. Used by the safety-net scheduler to find leads that need
 * to be nudged forward (e.g. an `enriched` lead with no generate-content
 * pipeline_jobs row needs one created).
 */
export function expectedNextStageForLeadStatus(status: Lead['status']): JobStage | null {
  switch (status) {
    case 'raw':
      return 'generate-content';
    case 'scraped':
      return 'generate-content';
    case 'enriched':
      return 'generate-content';
    case 'failed':
      return null;
    default:
      return null;
  }
}

/**
 * Map a generated_sites.status to the stage that should run next.
 *
 *   content-ready → build-site   (deploy hasn't run yet, queue it)
 *   deployed      → send-outreach
 *   deploy-failed → null (manual retry only)
 *   archived      → null
 */
export function expectedNextStageForSiteStatus(
  status: string | null | undefined,
): JobStage | null {
  switch (status) {
    case 'content-ready':
      return 'build-site';
    case 'deployed':
      return 'send-outreach';
    case 'deploy-failed':
    case 'archived':
      return null;
    default:
      return null;
  }
}
