import { describe, it, expect } from 'vitest';
import {
  nextStage,
  nextStageForRetry,
  expectedNextStageForLeadStatus,
  expectedNextStageForSiteStatus,
  STAGES,
  QUEUE_NAMES,
  type LeadLike,
} from '../stateMachine.js';

describe('stateMachine.nextStage', () => {
  const leadWithReviews: LeadLike = {
    email: 'a@b.com',
    rawData: { reviews: [{ text: 'great', rating: 5, author: 'Joe' }] },
  };
  const leadWithoutReviews: LeadLike = {
    email: 'a@b.com',
    rawData: { reviews: [] },
  };
  const leadWithNoRawData: LeadLike = { email: 'a@b.com', rawData: null };

  it('scrape → enrich when lead has reviews', () => {
    expect(nextStage('scrape', leadWithReviews)).toBe('enrich');
  });

  it('scrape → generate-content when lead has no reviews', () => {
    expect(nextStage('scrape', leadWithoutReviews)).toBe('generate-content');
  });

  it('scrape → generate-content when rawData is null', () => {
    expect(nextStage('scrape', leadWithNoRawData)).toBe('generate-content');
  });

  it('scrape → generate-content when rawData.reviews is not an array', () => {
    expect(nextStage('scrape', { rawData: { reviews: 'oops' } })).toBe('generate-content');
  });

  it('enrich → generate-content', () => {
    expect(nextStage('enrich', leadWithReviews)).toBe('generate-content');
  });

  it('generate-content → build-site', () => {
    expect(nextStage('generate-content', leadWithReviews)).toBe('build-site');
  });

  it('build-site → send-outreach', () => {
    expect(nextStage('build-site', leadWithReviews)).toBe('send-outreach');
  });

  it('send-outreach → null (terminal)', () => {
    expect(nextStage('send-outreach', leadWithReviews)).toBeNull();
  });
});

describe('stateMachine.nextStageForRetry', () => {
  it('retry stays on the same stage', () => {
    expect(nextStageForRetry('scrape')).toBe('scrape');
    expect(nextStageForRetry('enrich')).toBe('enrich');
    expect(nextStageForRetry('generate-content')).toBe('generate-content');
    expect(nextStageForRetry('build-site')).toBe('build-site');
    expect(nextStageForRetry('send-outreach')).toBe('send-outreach');
  });
});

describe('stateMachine.expectedNextStageForLeadStatus', () => {
  it('raw/scraped → enrich', () => {
    expect(expectedNextStageForLeadStatus('raw')).toBe('enrich');
    expect(expectedNextStageForLeadStatus('scraped')).toBe('enrich');
  });
  it('enriched → generate-content', () => {
    expect(expectedNextStageForLeadStatus('enriched')).toBe('generate-content');
  });
  it('failed → null', () => {
    expect(expectedNextStageForLeadStatus('failed')).toBeNull();
  });
});

describe('stateMachine.expectedNextStageForSiteStatus', () => {
  it('content-ready → build-site', () => {
    expect(expectedNextStageForSiteStatus('content-ready')).toBe('build-site');
  });
  it('deployed → send-outreach', () => {
    expect(expectedNextStageForSiteStatus('deployed')).toBe('send-outreach');
  });
  it('deploy-failed → null', () => {
    expect(expectedNextStageForSiteStatus('deploy-failed')).toBeNull();
  });
  it('archived → null', () => {
    expect(expectedNextStageForSiteStatus('archived')).toBeNull();
  });
  it('null/unknown → null', () => {
    expect(expectedNextStageForSiteStatus(null)).toBeNull();
    expect(expectedNextStageForSiteStatus(undefined)).toBeNull();
    expect(expectedNextStageForSiteStatus('garbage')).toBeNull();
  });
});

describe('STAGES and QUEUE_NAMES', () => {
  it('exposes all five pipeline stages in pipeline order', () => {
    expect(STAGES).toEqual([
      'scrape',
      'enrich',
      'generate-content',
      'build-site',
      'send-outreach',
    ]);
  });

  it('maps every stage to its frozen queue name', () => {
    expect(QUEUE_NAMES).toEqual({
      scrape: 'scrape',
      enrich: 'enrich',
      'generate-content': 'generate-content',
      'build-site': 'build-site',
      'send-outreach': 'send-outreach',
    });
  });
});
