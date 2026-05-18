import { ApifyClient } from 'apify-client';
import type { ScrapeJobPayload } from '@desany/types';
import type { ScrapeStrategy, RawBusiness } from './types.js';
import type { Logger } from '../logger.js';

interface ApifyStrategyOptions {
  token: string;
  actorId?: string;
  logger?: Logger;
}

interface ApifyReview {
  text?: string;
  reviewText?: string;
  stars?: number;
  rating?: number;
  reviewerName?: string;
  name?: string;
  author?: string;
}

interface ApifyPlace {
  title?: string;
  name?: string;
  categoryName?: string;
  category?: string;
  phone?: string;
  phoneNumber?: string;
  website?: string;
  url?: string;
  address?: string;
  street?: string;
  reviews?: ApifyReview[];
  [key: string]: unknown;
}

const DEFAULT_ACTOR_ID = 'compass/google-maps-extractor';

export class ApifyStrategy implements ScrapeStrategy {
  private readonly client: ApifyClient;
  private readonly actorId: string;
  private readonly logger?: Logger;

  constructor(opts: ApifyStrategyOptions) {
    this.client = new ApifyClient({ token: opts.token });
    this.actorId = opts.actorId ?? DEFAULT_ACTOR_ID;
    this.logger = opts.logger;
  }

  async scrape(input: ScrapeJobPayload): Promise<RawBusiness[]> {
    const { category, city, limit } = input;
    const searchString = `${category} in ${city}`;

    this.logger?.info(
      { actorId: this.actorId, searchString, limit },
      'starting apify actor run',
    );

    const run = await this.client.actor(this.actorId).call({
      searchStringsArray: [searchString],
      maxCrawledPlacesPerSearch: limit,
      language: 'en',
      includeReviews: true,
      maxReviews: 5,
    });

    const dataset = this.client.dataset(run.defaultDatasetId);
    const { items } = await dataset.listItems({ limit });

    this.logger?.info(
      { runId: run.id, datasetId: run.defaultDatasetId, count: items.length },
      'apify run finished',
    );

    return items
      .slice(0, limit)
      .map((item) => this.mapItem(item as ApifyPlace, category));
  }

  private mapItem(item: ApifyPlace, fallbackCategory: string): RawBusiness {
    const name = item.title ?? item.name ?? 'Unknown';
    const website = item.website ?? item.url ?? undefined;
    const phone = item.phone ?? item.phoneNumber ?? undefined;
    const address = item.address ?? item.street ?? undefined;
    const category = item.categoryName ?? item.category ?? fallbackCategory;

    const reviews = Array.isArray(item.reviews)
      ? item.reviews.slice(0, 5).map((r) => ({
          text: r.text ?? r.reviewText ?? '',
          rating: typeof r.stars === 'number' ? r.stars : (r.rating ?? 0),
          author: r.reviewerName ?? r.name ?? r.author ?? '',
        }))
      : [];

    return {
      name,
      category,
      phone,
      website,
      address,
      reviews,
      rawData: item,
    };
  }
}
