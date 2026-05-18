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
  const lead: LeadLike = {
    email: 'a@b.com',
    rawData: { reviews: [{ text: 'great', rating: 5, author: 'Joe' }] },
  };

  it('scrape → generate-content', () => {
    expect(nextStage('scrape', lead)).toBe('generate-content');
  });

  it('generate-content → build-site', () => {
    expect(nextStage('generate-content', lead)).toBe('build-site');
  });

  it('build-site → send-outreach', () => {
    expect(nextStage('build-site', lead)).toBe('send-outreach');
  });

  it('send-outreach → null (terminal)', () => {
    expect(nextStage('send-outreach', lead)).toBeNull();
  });
});

describe('stateMachine.nextStageForRetry', () => {
  it('retry stays on the same stage', () => {
    expect(nextStageForRetry('scrape')).toBe('scrape');
    expect(nextStageForRetry('generate-content')).toBe('generate-content');
    expect(nextStageForRetry('build-site')).toBe('build-site');
    expect(nextStageForRetry('send-outreach')).toBe('send-outreach');
  });
});

describe('stateMachine.expectedNextStageForLeadStatus', () => {
  it('raw/scraped/enriched → generate-content', () => {
    expect(expectedNextStageForLeadStatus('raw')).toBe('generate-content');
    expect(expectedNextStageForLeadStatus('scraped')).toBe('generate-content');
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
  it('exposes all four pipeline stages in pipeline order', () => {
    expect(STAGES).toEqual([
      'scrape',
      'generate-content',
      'build-site',
      'send-outreach',
    ]);
  });

  it('maps every stage to its frozen queue name', () => {
    expect(QUEUE_NAMES).toEqual({
      scrape: 'scrape',
      'generate-content': 'generate-content',
      'build-site': 'build-site',
      'send-outreach': 'send-outreach',
    });
  });
});
