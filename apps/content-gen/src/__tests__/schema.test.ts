import { describe, it, expect } from 'vitest';
import { landingContentSchema, parseLandingContent } from '../schema.js';

const validContent = {
  hero: { headline: 'Best fades in town', subheadline: 'Open seven days a week, walk-ins welcome.' },
  services: [
    { name: 'Fade', description: 'Skin to high fade, blended by hand.', icon: 'Scissors' },
    { name: 'Beard', description: 'Trim and line up.' },
    { name: 'Hot Shave', description: 'Old-school straight razor.' },
  ],
  testimonials: [
    { text: 'Best cut ever.', author: 'Marcus T.', rating: 5 },
    { text: 'Super friendly.', author: 'Diego R.', rating: 5 },
  ],
  about: 'We have been cutting hair on South Congress since 2003.',
  cta: { text: 'Call to book', action: 'phone' as const, target: '+1-512-555-0142' },
  contact: { phone: '+1-512-555-0142', email: 'hi@joes.com', address: '212 South Congress, Austin TX' },
  colors: { primary: '#1a1a1a', secondary: '#c9a96e', accent: '#f5f1ea' },
  styleVariant: 'bold' as const,
};

describe('landingContentSchema', () => {
  it('accepts a well-formed LandingContent', () => {
    expect(() => parseLandingContent(validContent)).not.toThrow();
  });

  it('rejects when a required field is missing', () => {
    const { hero: _hero, ...withoutHero } = validContent;
    const result = landingContentSchema.safeParse(withoutHero);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'hero')).toBe(true);
    }
  });

  it('rejects when a nested required field is missing (cta.action)', () => {
    const bad = { ...validContent, cta: { text: 'Call', target: '+1' } };
    const result = landingContentSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects wrong type — services as string instead of array', () => {
    const bad = { ...validContent, services: 'haircuts, beards, shaves' };
    const result = landingContentSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'services')).toBe(true);
    }
  });

  it('rejects wrong type — testimonial rating as string', () => {
    const bad = {
      ...validContent,
      testimonials: [{ text: 'great', author: 'A', rating: '5' as unknown as number }],
    };
    const result = landingContentSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects rating out of range', () => {
    const bad = {
      ...validContent,
      testimonials: [{ text: 'great', author: 'A', rating: 7 }],
    };
    const result = landingContentSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects styleVariant outside the enum', () => {
    const bad = { ...validContent, styleVariant: 'whimsical' as unknown as 'modern' };
    const result = landingContentSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects malformed hex colors', () => {
    const bad = { ...validContent, colors: { primary: 'red', secondary: '#abcdef', accent: '#abcdef' } };
    const result = landingContentSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects bad cta.action enum value', () => {
    const bad = { ...validContent, cta: { ...validContent.cta, action: 'sms' as unknown as 'phone' } };
    const result = landingContentSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('is strict — extra top-level fields are rejected', () => {
    const bad = { ...validContent, extraneous: 'nope' };
    const result = landingContentSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('is strict — extra nested fields are rejected', () => {
    const bad = {
      ...validContent,
      hero: { ...validContent.hero, tagline: 'extra' },
    };
    const result = landingContentSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('requires at least one service', () => {
    const bad = { ...validContent, services: [] };
    const result = landingContentSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('allows optional icon to be absent on a service', () => {
    const fine = {
      ...validContent,
      services: [{ name: 'Cut', description: 'Just a cut.' }],
    };
    const result = landingContentSchema.safeParse(fine);
    expect(result.success).toBe(true);
  });
});
