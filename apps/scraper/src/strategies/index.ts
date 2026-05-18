import { config } from '../config.js';
import { logger } from '../logger.js';
import { ApifyStrategy } from './apify.js';
import { PlaywrightStrategy } from './playwright.js';
import type { ScrapeStrategy } from './types.js';

export function selectStrategy(): ScrapeStrategy {
  if (config.SCRAPER_STRATEGY === 'apify') {
    if (!config.APIFY_TOKEN) {
      throw new Error('APIFY_TOKEN is required when SCRAPER_STRATEGY=apify');
    }
    return new ApifyStrategy({
      token: config.APIFY_TOKEN,
      actorId: config.APIFY_ACTOR_ID,
      logger,
    });
  }

  return new PlaywrightStrategy({
    headless: config.NODE_ENV !== 'development',
    logger,
  });
}

export type { ScrapeStrategy, RawBusiness } from './types.js';
