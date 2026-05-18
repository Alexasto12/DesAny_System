import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LandingContent } from '@desany/types';

let cached: LandingContent | null = null;

/**
 * Resolve which content.json to load.
 *
 * Order of precedence:
 *   1. SITE_CONTENT_PATH env var (absolute or relative to cwd)
 *   2. ./content.json in cwd (what the generate-site script writes)
 *   3. ./fixtures/peluqueria-modern.json (so `pnpm dev` works out of the box)
 */
function resolveContentPath(): string {
  const cwd = process.cwd();
  const envPath = process.env.SITE_CONTENT_PATH;
  if (envPath) {
    const resolved = resolve(cwd, envPath);
    if (existsSync(resolved)) return resolved;
    throw new Error(`SITE_CONTENT_PATH does not exist: ${resolved}`);
  }
  const local = resolve(cwd, 'content.json');
  if (existsSync(local)) return local;
  const fallback = resolve(cwd, 'fixtures/peluqueria-modern.json');
  if (existsSync(fallback)) return fallback;
  throw new Error(
    'No content.json found. Copy a fixture: cp fixtures/peluqueria-modern.json content.json',
  );
}

export function getContent(): LandingContent {
  if (cached) return cached;
  const path = resolveContentPath();
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as LandingContent;
  cached = parsed;
  return parsed;
}

export function ctaHref(cta: LandingContent['cta']): string {
  switch (cta.action) {
    case 'phone':
      return `tel:${cta.target.replace(/\s+/g, '')}`;
    case 'email':
      return `mailto:${cta.target}`;
    case 'contact-form':
    default:
      return cta.target.startsWith('#') ? cta.target : `#${cta.target || 'contact'}`;
  }
}
