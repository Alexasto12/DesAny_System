import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { ScrapeJobPayload } from '@desany/types';
import type { ScrapeStrategy, RawBusiness } from './types.js';
import type { Logger } from '../logger.js';

chromium.use(StealthPlugin());

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const RESULTS_FEED_SELECTOR = 'div[role="feed"]';
const RESULT_CARD_SELECTOR = 'div[role="feed"] a[href*="/maps/place/"]';
const MAX_SCROLL_ITERATIONS = 60;
const SCROLL_STABLE_LIMIT = 5;
const SCROLL_WAIT_MS = 1500;

interface PlaywrightStrategyOptions {
  headless?: boolean;
  logger?: Logger;
}

export class PlaywrightStrategy implements ScrapeStrategy {
  private readonly headless: boolean;
  private readonly logger?: Logger;

  constructor(opts: PlaywrightStrategyOptions = {}) {
    this.headless = opts.headless ?? true;
    this.logger = opts.logger;
  }

  async scrape(input: ScrapeJobPayload): Promise<RawBusiness[]> {
    const { category, city, limit } = input;
    const browser: Browser = await chromium.launch({ headless: this.headless });

    try {
      const context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1366, height: 800 },
        locale: 'en-US',
      });
      const page = await context.newPage();

      const query = encodeURIComponent(`${category} in ${city}`);
      const url = `https://www.google.com/maps/search/${query}`;
      this.logger?.info({ url }, 'navigating to google maps');

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.dismissConsent(page);
      await this.dismissLoginWall(page);

      await page.waitForSelector(RESULTS_FEED_SELECTOR, { timeout: 20000 });
      await this.scrollUntilLimit(page, limit);

      const placeUrls = await this.collectPlaceUrls(page, limit);
      this.logger?.info({ count: placeUrls.length }, 'collected place urls');

      const businesses: RawBusiness[] = [];
      for (const placeUrl of placeUrls) {
        try {
          const biz = await this.scrapePlace(context, placeUrl, category);
          if (biz) businesses.push(biz);
        } catch (err) {
          this.logger?.warn(
            { err, placeUrl },
            'failed to scrape place, skipping',
          );
        }
      }

      return businesses;
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  private async dismissConsent(page: Page): Promise<void> {
    const candidates = [
      'button:has-text("Accept all")',
      'button:has-text("Acepto")',
      'button:has-text("I agree")',
      'form[action*="consent"] button',
    ];
    for (const selector of candidates) {
      const btn = page.locator(selector).first();
      try {
        if (await btn.isVisible({ timeout: 1500 })) {
          await btn.click({ timeout: 3000 });
          await page.waitForLoadState('domcontentloaded').catch(() => undefined);
          return;
        }
      } catch {
        // try next
      }
    }
  }

  private async dismissLoginWall(page: Page): Promise<void> {
    const dismiss = page.locator('button[aria-label*="Close" i]').first();
    try {
      if (await dismiss.isVisible({ timeout: 1500 })) {
        await dismiss.click({ timeout: 2000 });
      }
    } catch {
      // ignore
    }
  }

  private async scrollUntilLimit(page: Page, limit: number): Promise<void> {
    let lastCount = 0;
    let stable = 0;

    for (let i = 0; i < MAX_SCROLL_ITERATIONS; i++) {
      const count = await page.locator(RESULT_CARD_SELECTOR).count();
      if (count >= limit) return;

      if (count === lastCount) {
        stable++;
        if (stable >= SCROLL_STABLE_LIMIT) return;
      } else {
        stable = 0;
        lastCount = count;
      }

      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.scrollTop = el.scrollHeight;
      }, RESULTS_FEED_SELECTOR);

      await page.waitForTimeout(SCROLL_WAIT_MS);
    }
  }

  private async collectPlaceUrls(page: Page, limit: number): Promise<string[]> {
    const hrefs = await page
      .locator(RESULT_CARD_SELECTOR)
      .evaluateAll((nodes) =>
        nodes
          .map((n) => (n as HTMLAnchorElement).href)
          .filter((h): h is string => typeof h === 'string' && h.length > 0),
      );
    const unique = Array.from(new Set(hrefs));
    return unique.slice(0, limit);
  }

  private async scrapePlace(
    context: BrowserContext,
    placeUrl: string,
    fallbackCategory: string,
  ): Promise<RawBusiness | null> {
    const page = await context.newPage();
    try {
      await page.goto(placeUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForSelector('h1', { timeout: 15000 });

      const name = (await page.locator('h1').first().textContent())?.trim() ?? '';

      const category = await this.firstTextContent(
        page,
        'button[jsaction*="category"]',
        fallbackCategory,
      );

      const website = await this.firstAttribute(
        page,
        'a[data-item-id*="authority"]',
        'href',
      );

      const phoneLabel = await this.firstAttribute(
        page,
        'button[data-item-id^="phone"]',
        'aria-label',
      );
      const phone = phoneLabel
        ? phoneLabel.replace(/^Phone:\s*/i, '').trim()
        : undefined;

      const addressLabel = await this.firstAttribute(
        page,
        'button[data-item-id="address"]',
        'aria-label',
      );
      const address = addressLabel
        ? addressLabel.replace(/^Address:\s*/i, '').trim()
        : undefined;

      const reviews = await this.extractReviews(page);

      return {
        name,
        category,
        phone,
        website: website ?? undefined,
        address,
        reviews,
        rawData: { sourceUrl: placeUrl },
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private async firstTextContent(
    page: Page,
    selector: string,
    fallback: string,
  ): Promise<string> {
    try {
      const el = page.locator(selector).first();
      if (await el.count()) {
        const txt = (await el.textContent())?.trim();
        if (txt) return txt;
      }
    } catch {
      // ignore
    }
    return fallback;
  }

  private async firstAttribute(
    page: Page,
    selector: string,
    attr: string,
  ): Promise<string | undefined> {
    try {
      const el = page.locator(selector).first();
      if (await el.count()) {
        const val = await el.getAttribute(attr);
        return val ?? undefined;
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  private async extractReviews(
    page: Page,
  ): Promise<Array<{ text: string; rating: number; author: string }>> {
    try {
      const reviews = await page
        .locator('[data-review-id]')
        .evaluateAll((nodes) =>
          nodes.slice(0, 5).map((node) => {
            const text =
              node.querySelector('.wiI7pd')?.textContent?.trim() ??
              node.querySelector('[class*="review-text"]')?.textContent?.trim() ??
              '';
            const ratingEl = node.querySelector('[aria-label*="star" i]');
            const ratingLabel = ratingEl?.getAttribute('aria-label') ?? '';
            const ratingMatch = ratingLabel.match(/([\d.]+)\s*star/i);
            const rating = ratingMatch ? parseFloat(ratingMatch[1]!) : 0;
            const author =
              node.querySelector('.d4r55')?.textContent?.trim() ??
              node.querySelector('[class*="author"]')?.textContent?.trim() ??
              '';
            return { text, rating, author };
          }),
        );
      return reviews;
    } catch {
      return [];
    }
  }
}
