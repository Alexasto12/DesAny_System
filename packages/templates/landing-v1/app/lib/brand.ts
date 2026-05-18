/**
 * The LandingContent type does not carry a dedicated businessName.
 * The hero headline carries the brand voice; we extract a short brand
 * mark by taking the portion before the first em/en-dash, pipe, or colon.
 * Fixtures are written so headlines like "Brand Name — Tagline" yield a
 * clean split between brand mark and tagline.
 */

const HEADLINE_SPLIT = /^(.+?)\s*[—–|:·]\s*(.+)$/;

export function splitHeadline(headline: string): { brand: string | null; tagline: string } {
  const trimmed = headline.trim();
  const match = trimmed.match(HEADLINE_SPLIT);
  if (match) {
    return { brand: match[1].trim(), tagline: match[2].trim() };
  }
  return { brand: null, tagline: trimmed };
}

export function getBrand(headline: string): string {
  const { brand, tagline } = splitHeadline(headline);
  if (brand) return brand;
  const words = tagline.split(/\s+/).slice(0, 3).join(' ');
  return words || tagline;
}
