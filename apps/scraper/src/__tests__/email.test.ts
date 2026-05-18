import { describe, expect, it, vi } from 'vitest';
import {
  decodeObfuscatedEmails,
  enrichEmail,
  extractEmailsFromText,
  isValidEmail,
  pickFirstValid,
} from '../enrichment/email.js';

describe('extractEmailsFromText', () => {
  it('finds plain emails in plain text', () => {
    const html = '<p>Contact us at hello@acme.com or sales@acme.com</p>';
    expect(extractEmailsFromText(html)).toEqual([
      'hello@acme.com',
      'sales@acme.com',
    ]);
  });

  it('finds emails inside mailto: anchors', () => {
    const html = '<a href="mailto:owner@example-business.co.uk">Email</a>';
    expect(extractEmailsFromText(html)).toContain(
      'owner@example-business.co.uk',
    );
  });

  it('returns empty list when no emails present', () => {
    expect(extractEmailsFromText('<p>Call us at (555) 010-1234</p>')).toEqual(
      [],
    );
  });
});

describe('isValidEmail', () => {
  it('accepts a normal business email', () => {
    expect(isValidEmail('owner@hairsalon.la')).toBe(true);
    expect(isValidEmail('jane.doe+contact@acme-inc.com')).toBe(true);
  });

  it('rejects example/test domains', () => {
    expect(isValidEmail('foo@example.com')).toBe(false);
    expect(isValidEmail('user@test.com')).toBe(false);
  });

  it('rejects vendor/CMS domains', () => {
    expect(isValidEmail('alert@sentry.io')).toBe(false);
    expect(isValidEmail('x@sentry-next.wixpress.com')).toBe(false);
    expect(isValidEmail('hello@webflow.com')).toBe(false);
    expect(isValidEmail('foo@subdomain.wixpress.com')).toBe(false);
  });

  it('rejects role/no-reply local parts', () => {
    expect(isValidEmail('no-reply@acme.com')).toBe(false);
    expect(isValidEmail('noreply@acme.com')).toBe(false);
    expect(isValidEmail('postmaster@acme.com')).toBe(false);
  });

  it('rejects retina/image filename false positives', () => {
    expect(isValidEmail('icon@2x.png')).toBe(false);
    expect(isValidEmail('logo@3x.jpg')).toBe(false);
    expect(isValidEmail('hero@2x.webp')).toBe(false);
  });

  it('rejects plain image extensions', () => {
    expect(isValidEmail('asset@cdn.png')).toBe(false);
    expect(isValidEmail('img@assets.jpg')).toBe(false);
  });

  it('rejects nonsense TLDs', () => {
    expect(isValidEmail('foo@bar.x')).toBe(false);
    expect(
      isValidEmail('foo@bar.' + 'a'.repeat(30)),
    ).toBe(false);
  });
});

describe('decodeObfuscatedEmails', () => {
  it('decodes "X at Y dot Z" patterns', () => {
    const found = decodeObfuscatedEmails(
      'You can reach me at contact at example-shop dot com for inquiries',
    );
    expect(found).toContain('contact@example-shop.com');
  });

  it('decodes bracketed obfuscation', () => {
    const found = decodeObfuscatedEmails(
      'owner [at] hairsalon [dot] la',
    );
    expect(found).toContain('owner@hairsalon.la');
  });

  it('decodes parenthesized obfuscation', () => {
    const found = decodeObfuscatedEmails(
      'hello (at) bistro (dot) nyc',
    );
    expect(found).toContain('hello@bistro.nyc');
  });

  it('decodes HTML entity obfuscation (&#64; / &#46;)', () => {
    const found = decodeObfuscatedEmails(
      'owner&#64;hairsalon&#46;la',
    );
    expect(found).toContain('owner@hairsalon.la');
  });
});

describe('pickFirstValid', () => {
  it('skips invalid entries and returns the first valid', () => {
    const result = pickFirstValid([
      'icon@2x.png',
      'no-reply@acme.com',
      'foo@example.com',
      'owner@hairsalon.la',
      'second@hairsalon.la',
    ]);
    expect(result).toBe('owner@hairsalon.la');
  });

  it('returns null when no valid emails are present', () => {
    expect(pickFirstValid(['icon@2x.png', 'foo@example.com'])).toBeNull();
  });
});

describe('enrichEmail', () => {
  function makeFetcher(responses: Record<string, string>) {
    return vi.fn(async (url: string) => {
      const body = responses[url];
      if (body === undefined) {
        return new Response('', { status: 404 });
      }
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    });
  }

  it('returns the first valid email found across candidate paths', async () => {
    const responses = {
      'https://acme.test/': '<html>icon@2x.png and noreply@acme.test</html>',
      'https://acme.test/contact':
        '<p>Reach the owner at <a href="mailto:owner@acme.test">owner@acme.test</a></p>',
      'https://acme.test/contacto': '',
      'https://acme.test/about': '',
    };
    const fetcher = makeFetcher(responses);

    const result = await enrichEmail('https://acme.test/', {
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(result).toBe('owner@acme.test');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('falls back to obfuscated email when no plain email is found', async () => {
    const responses = {
      'https://shop.test/':
        '<p>You can reach owner at shop-test dot com for inquiries</p>',
      'https://shop.test/contact': '',
      'https://shop.test/contacto': '',
      'https://shop.test/about': '',
    };
    const fetcher = makeFetcher(responses);

    const result = await enrichEmail('https://shop.test/', {
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(result).toBe('owner@shop-test.com');
  });

  it('returns null when only denied emails are found', async () => {
    const responses = {
      'https://denied.test/':
        'Contact noreply@denied.test or foo@example.com or icon@2x.png',
      'https://denied.test/contact': '',
      'https://denied.test/contacto': '',
      'https://denied.test/about': '',
    };
    const fetcher = makeFetcher(responses);

    const result = await enrichEmail('https://denied.test/', {
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(result).toBeNull();
  });

  it('returns null on invalid URL input', async () => {
    const fetcher = vi.fn();
    const result = await enrichEmail('not-a-url', {
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(result).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects non-http(s) schemes', async () => {
    const fetcher = vi.fn();
    expect(
      await enrichEmail('ftp://acme.test', {
        fetcher: fetcher as unknown as typeof fetch,
      }),
    ).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('aborts hung requests via timeout', async () => {
    const fetcher = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const result = await enrichEmail('https://slow.test/', {
      fetcher: fetcher as unknown as typeof fetch,
      timeoutMs: 25,
    });
    expect(result).toBeNull();
  });
});
