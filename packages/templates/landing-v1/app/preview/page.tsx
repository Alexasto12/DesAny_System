import type { CSSProperties } from 'react';
import type { LandingContent } from '@desany/types';
import { Hero } from '../components/Hero';
import { Services } from '../components/Services';
import { Testimonials } from '../components/Testimonials';
import { About } from '../components/About';
import { Contact } from '../components/Contact';
import { Footer } from '../components/Footer';
import peluqueria from '../../fixtures/peluqueria-modern.json';
import boutique from '../../fixtures/boutique-elegant.json';
import tattoo from '../../fixtures/tattoo-bold.json';

export const metadata = {
  title: 'Landing v1 — Variant Preview',
  description: 'Side-by-side render of all three style variants for dev QA.',
};

type Fixture = { label: string; description: string; data: LandingContent };

const FIXTURES: Fixture[] = [
  {
    label: 'Modern',
    description: 'Inter · soft shadows · rounded · subtle gradients',
    data: peluqueria as LandingContent,
  },
  {
    label: 'Elegant',
    description: 'Playfair + Inter · muted earth · generous tracking',
    data: boutique as LandingContent,
  },
  {
    label: 'Bold',
    description: 'Space Grotesk · high contrast · geometric clip-paths',
    data: tattoo as LandingContent,
  },
];

function cssVarsFor(content: LandingContent): CSSProperties {
  return {
    ['--color-primary' as string]: content.colors.primary,
    ['--color-secondary' as string]: content.colors.secondary,
    ['--color-accent' as string]: content.colors.accent,
    background: content.colors.secondary,
    color: content.colors.primary,
  };
}

export default function PreviewPage() {
  return (
    <div style={{ background: '#0a0a0a', color: '#fafafa' }}>
      <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 text-sm">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-neutral-400">
            landing-v1 · variant preview
          </span>
          <nav className="flex gap-4 text-xs text-neutral-300">
            {FIXTURES.map((f) => (
              <a
                key={f.data.styleVariant}
                href={`#preview-${f.data.styleVariant}`}
                className="hover:text-white"
              >
                {f.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {FIXTURES.map((fixture) => (
        <section
          key={fixture.data.styleVariant}
          id={`preview-${fixture.data.styleVariant}`}
          className="border-b border-neutral-800"
        >
          <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4 px-6 py-6">
            <h2 className="text-lg font-semibold text-white">
              {fixture.label}{' '}
              <span className="ml-2 font-mono text-xs uppercase tracking-widest text-neutral-500">
                {fixture.data.styleVariant}
              </span>
            </h2>
            <p className="hidden text-xs text-neutral-400 sm:block">{fixture.description}</p>
          </div>

          <div
            data-variant={fixture.data.styleVariant}
            className="v-root"
            style={cssVarsFor(fixture.data)}
          >
            <Hero content={fixture.data} />
            <Services content={fixture.data} />
            <About content={fixture.data} />
            <Testimonials content={fixture.data} />
            <Contact content={fixture.data} />
            <Footer content={fixture.data} />
          </div>
        </section>
      ))}

      <footer className="px-6 py-10 text-center text-xs text-neutral-500">
        Dev preview only · not shipped to tenants.
      </footer>
    </div>
  );
}
