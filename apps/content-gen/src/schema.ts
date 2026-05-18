import { z } from 'zod';
import type { LandingContent } from '@desany/types';

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'expected hex color like #1a2b3c');

export const landingContentSchema = z
  .object({
    hero: z
      .object({
        headline: z.string().min(1),
        subheadline: z.string().min(1),
      })
      .strict(),
    services: z
      .array(
        z
          .object({
            name: z.string().min(1),
            description: z.string().min(1),
            icon: z.string().min(1).optional(),
          })
          .strict(),
      )
      .min(1),
    testimonials: z
      .array(
        z
          .object({
            text: z.string().min(1),
            author: z.string().min(1),
            rating: z.number().int().min(1).max(5),
          })
          .strict(),
      )
      .min(1),
    about: z.string().min(1),
    cta: z
      .object({
        text: z.string().min(1),
        action: z.enum(['phone', 'email', 'contact-form']),
        target: z.string().min(1),
      })
      .strict(),
    contact: z
      .object({
        phone: z.string().min(1).optional(),
        email: z.string().min(1).optional(),
        address: z.string().min(1).optional(),
        mapsEmbedUrl: z.string().min(1).optional(),
      })
      .strict(),
    colors: z
      .object({
        primary: hexColor,
        secondary: hexColor,
        accent: hexColor,
      })
      .strict(),
    styleVariant: z.enum(['modern', 'elegant', 'bold']),
  })
  .strict();

export type LandingContentParsed = z.infer<typeof landingContentSchema>;

const _assertCompatible: LandingContentParsed = {} as LandingContent;
void _assertCompatible;

export function parseLandingContent(value: unknown): LandingContent {
  return landingContentSchema.parse(value) as LandingContent;
}

export const reviewSummarySchema = z
  .object({
    services: z.array(z.string().min(1)).min(1),
    tone: z.string().min(1),
    palette: z
      .object({
        primary: hexColor,
        secondary: hexColor,
        accent: hexColor,
      })
      .strict(),
  })
  .strict();

export type ReviewSummary = z.infer<typeof reviewSummarySchema>;
