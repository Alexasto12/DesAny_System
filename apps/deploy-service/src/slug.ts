const MAX_SLUG_LENGTH = 50;
const MAX_PROJECT_NAME_LENGTH = 100;
const PROJECT_PREFIX = 'desany-';
const COMBINING_DIACRITICALS = /[̀-ͯ]/g;

export function slugify(input: string): string {
  if (typeof input !== 'string') {
    return 'site';
  }

  const normalized = input.normalize('NFKD').replace(COMBINING_DIACRITICALS, '');

  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  const truncated = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');

  return truncated || 'site';
}

export function buildProjectName(businessName: string, city: string, siteId: number): string {
  const slug = slugify(`${businessName}-${city}`);
  const suffix = `-${siteId}`;
  const room = MAX_PROJECT_NAME_LENGTH - PROJECT_PREFIX.length - suffix.length;
  const trimmedSlug = slug.slice(0, room).replace(/-+$/g, '') || 'site';
  return `${PROJECT_PREFIX}${trimmedSlug}${suffix}`;
}
