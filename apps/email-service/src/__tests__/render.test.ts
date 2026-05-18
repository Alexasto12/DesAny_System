import { describe, it, expect } from 'vitest';

process.env.RESEND_API_KEY = 'test_key';
process.env.EMAIL_FROM = 'DesAny <hola@desany.dev>';
process.env.TRACKING_BASE_URL = 'https://track.desany.dev';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.DATABASE_URL = 'postgresql://desany:desany@localhost:5432/desany';

import {
  renderBody,
  pickSubject,
  loadSubjects,
  appendTrackingPixel,
  type RenderVars,
} from '../render.js';

const VARS: RenderVars = {
  businessName: 'Bar Pepe',
  city: 'Madrid',
  category: 'restaurante',
  siteUrl: 'https://bar-pepe.desany.dev',
  senderName: 'Alex',
  senderTitle: 'Founder, DesAny',
};

describe('renderBody', () => {
  it('renders the EN template with all variables substituted', async () => {
    const html = await renderBody('en', VARS);
    expect(html).toContain('Bar Pepe');
    expect(html).toContain('Madrid');
    expect(html).toContain('restaurante');
    expect(html).toContain('https://bar-pepe.desany.dev');
    expect(html).toContain('Alex');
    expect(html).toContain('Founder, DesAny');
  });

  it('renders the ES template with all variables substituted', async () => {
    const html = await renderBody('es', VARS);
    expect(html).toContain('Bar Pepe');
    expect(html).toContain('Madrid');
    expect(html).toContain('https://bar-pepe.desany.dev');
    expect(html).toContain('Alex');
  });

  it('leaves no leftover handlebars placeholders in EN', async () => {
    const html = await renderBody('en', VARS);
    expect(html).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('leaves no leftover handlebars placeholders in ES', async () => {
    const html = await renderBody('es', VARS);
    expect(html).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('contains the opt-out PS line in EN', async () => {
    const html = await renderBody('en', VARS);
    expect(html.toLowerCase()).toContain('no thanks');
  });

  it('contains the opt-out PD line in ES', async () => {
    const html = await renderBody('es', VARS);
    expect(html.toLowerCase()).toContain('no gracias');
  });
});

describe('subjects', () => {
  it('loadSubjects returns en and es arrays', async () => {
    const subjects = await loadSubjects();
    expect(subjects.en).toBeInstanceOf(Array);
    expect(subjects.es).toBeInstanceOf(Array);
    expect(subjects.en.length).toBeGreaterThan(0);
    expect(subjects.es.length).toBeGreaterThan(0);
  });

  it('pickSubject returns a fully-rendered string with no placeholders (en)', async () => {
    for (let i = 0; i < 20; i++) {
      const subject = await pickSubject('en', VARS);
      expect(subject).toContain('Bar Pepe');
      expect(subject).not.toMatch(/\{\{[^}]+\}\}/);
    }
  });

  it('pickSubject returns a fully-rendered string with no placeholders (es)', async () => {
    for (let i = 0; i < 20; i++) {
      const subject = await pickSubject('es', VARS);
      expect(subject).toContain('Bar Pepe');
      expect(subject).not.toMatch(/\{\{[^}]+\}\}/);
    }
  });

  it('pickSubject is lowercase by design (no uppercase first char in template)', async () => {
    const subjects = await loadSubjects();
    for (const tmpl of subjects.en) {
      expect(tmpl[0]).toBe(tmpl[0]?.toLowerCase());
    }
    for (const tmpl of subjects.es) {
      expect(tmpl[0]).toBe(tmpl[0]?.toLowerCase());
    }
  });
});

describe('appendTrackingPixel', () => {
  it('appends an img tag with the given URL', () => {
    const out = appendTrackingPixel('<p>hi</p>', 'https://track.desany.dev/track/open/42');
    expect(out).toContain('<p>hi</p>');
    expect(out).toContain('https://track.desany.dev/track/open/42');
    expect(out).toContain('width="1"');
    expect(out).toContain('height="1"');
  });
});
