import { describe, expect, it } from 'vitest';
import { buildProjectName, slugify } from '../slug.js';

describe('slugify', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('Acme Pizza Co')).toBe('acme-pizza-co');
  });

  it('strips special characters', () => {
    expect(slugify("Joe's Diner! @ Main St.")).toBe('joes-diner-main-st');
  });

  it('collapses runs of whitespace and dashes', () => {
    expect(slugify('hello   world   --   foo')).toBe('hello-world-foo');
  });

  it('normalizes unicode diacritics', () => {
    expect(slugify('Café Niño')).toBe('cafe-nino');
  });

  it('strips non-latin characters', () => {
    expect(slugify('東京 Tokyo')).toBe('tokyo');
  });

  it('returns "site" fallback when string has nothing usable', () => {
    expect(slugify('!!!@@@###')).toBe('site');
    expect(slugify('   ')).toBe('site');
    expect(slugify('')).toBe('site');
  });

  it('returns "site" for non-string input', () => {
    // @ts-expect-error testing runtime defensiveness
    expect(slugify(null)).toBe('site');
    // @ts-expect-error testing runtime defensiveness
    expect(slugify(undefined)).toBe('site');
  });

  it('truncates to 50 characters', () => {
    const longName = 'a'.repeat(80);
    const result = slugify(longName);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result).toBe('a'.repeat(50));
  });

  it('does not end with a dash after truncation', () => {
    const input = 'this-is-a-very-long-business-name-that-cuts-off-at-d-ash-here';
    const result = slugify(input);
    expect(result.endsWith('-')).toBe(false);
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('---hello-world---')).toBe('hello-world');
  });
});

describe('buildProjectName', () => {
  it('builds a vercel-safe project name', () => {
    expect(buildProjectName('Acme Pizza', 'Brooklyn', 42)).toBe('desany-acme-pizza-brooklyn-42');
  });

  it('keeps total length under 100 chars', () => {
    const huge = 'X'.repeat(200);
    const name = buildProjectName(huge, huge, 9999);
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.startsWith('desany-')).toBe(true);
    expect(name.endsWith('-9999')).toBe(true);
  });

  it('handles empty business name gracefully', () => {
    const name = buildProjectName('', '', 7);
    expect(name).toMatch(/^desany-.+-7$/);
  });

  it('handles all-symbol input gracefully', () => {
    const name = buildProjectName('!!!', '@@@', 7);
    expect(name).toMatch(/^desany-.+-7$/);
  });
});
