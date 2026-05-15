import type { Logger } from '../logger.js';

export const EMAIL_REGEX =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export const CANDIDATE_PATHS = ['/', '/contact', '/contacto', '/about'];

export const FETCH_TIMEOUT_MS = 5000;

const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.bmp',
];

export const DENYLIST_DOMAINS = new Set<string>([
  'example.com',
  'example.org',
  'example.net',
  'sentry.io',
  'sentry-next.wixpress.com',
  'wixpress.com',
  'godaddy.com',
  'webflow.com',
  'webflow.io',
  'shopify.com',
  'cloudflare.com',
  'gstatic.com',
  'googleusercontent.com',
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'placeholder.com',
  'yourdomain.com',
  'domain.com',
  'email.com',
  'mail.com',
  'test.com',
]);

export const DENYLIST_LOCAL_PARTS = new Set<string>([
  'no-reply',
  'noreply',
  'donotreply',
  'do-not-reply',
  'postmaster',
  'mailer-daemon',
]);

const DENYLIST_LOCAL_PREFIXES = ['sales@webflow', 'noreply@', 'no-reply@'];

interface EnrichOptions {
  logger?: Logger;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  paths?: readonly string[];
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes('@')) return false;

  const at = trimmed.lastIndexOf('@');
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  if (!local || !domain) return false;
  if (DENYLIST_LOCAL_PARTS.has(local)) return false;
  if (DENYLIST_LOCAL_PREFIXES.some((p) => trimmed.startsWith(p))) return false;

  if (IMAGE_EXTENSIONS.some((ext) => trimmed.endsWith(ext))) return false;
  // Catch @2x/@3x retina filenames that match the regex (e.g. icon@2x.png)
  if (/@\d+x\.[a-z]{2,5}$/i.test(trimmed)) return false;

  for (const denied of DENYLIST_DOMAINS) {
    if (domain === denied || domain.endsWith(`.${denied}`)) return false;
  }

  // Real TLD sanity check
  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2 || tld.length > 24) return false;

  return true;
}

export function extractEmailsFromText(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) ?? [];
  return matches.map((m) => m.toLowerCase());
}

export function decodeObfuscatedEmails(text: string): string[] {
  const found: string[] = [];

  // "local at domain dot tld" (and bracketed/parenthesized variants)
  const wordy =
    /([a-zA-Z0-9._+-]+)\s*[\[\(]?\s*(?:at|@)\s*[\]\)]?\s*([a-zA-Z0-9.-]+)\s*[\[\(]?\s*(?:dot|\.)\s*[\]\)]?\s*([a-zA-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = wordy.exec(text)) !== null) {
    const candidate = `${m[1]}@${m[2]}.${m[3]}`.toLowerCase();
    found.push(candidate);
  }

  // HTML entity obfuscation: &#64; for @, &#46; for .
  const entityDecoded = text
    .replace(/&#0?64;/g, '@')
    .replace(/&#0?46;/g, '.')
    .replace(/&commat;/gi, '@');
  if (entityDecoded !== text) {
    found.push(...extractEmailsFromText(entityDecoded));
  }

  return found;
}

async function fetchText(
  url: string,
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; DesanyBot/0.1; +https://desany.dev/bot)',
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (ct && !ct.includes('text') && !ct.includes('html')) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function pickFirstValid(emails: readonly string[]): string | null {
  for (const e of emails) {
    if (isValidEmail(e)) return e.toLowerCase();
  }
  return null;
}

export async function enrichEmail(
  websiteUrl: string,
  opts: EnrichOptions = {},
): Promise<string | null> {
  let base: URL;
  try {
    base = new URL(websiteUrl);
  } catch {
    return null;
  }

  if (base.protocol !== 'http:' && base.protocol !== 'https:') return null;

  const fetcher = opts.fetcher ?? fetch;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const paths = opts.paths ?? CANDIDATE_PATHS;

  const urls = paths.map((p) => new URL(p, base).toString());

  const results = await Promise.allSettled(
    urls.map((u) => fetchText(u, fetcher, timeoutMs)),
  );

  const direct: string[] = [];
  const obfuscated: string[] = [];

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const body = r.value;
    direct.push(...extractEmailsFromText(body));
    obfuscated.push(...decodeObfuscatedEmails(body));
  }

  const picked = pickFirstValid(direct) ?? pickFirstValid(obfuscated);
  if (!picked) {
    opts.logger?.debug({ websiteUrl }, 'no valid email found');
  }
  return picked;
}
