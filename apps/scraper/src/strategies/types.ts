import type { ScrapeJobPayload } from '@desany/types';

export interface RawBusiness {
  name: string;
  category: string;
  phone?: string;
  website?: string;
  address?: string;
  reviews?: Array<{ text: string; rating: number; author: string }>;
  rawData: Record<string, unknown>;
}

export interface ScrapeStrategy {
  scrape(input: ScrapeJobPayload): Promise<RawBusiness[]>;
}
