import type { LandingContent } from '@desany/types';
import { ArrowRight } from 'lucide-react';
import { ctaHref } from '../lib/content';
import { splitHeadline } from '../lib/brand';

export function Hero({ content }: { content: LandingContent }) {
  const { hero, cta } = content;
  const { brand, tagline } = splitHeadline(hero.headline);

  return (
    <section className="v-hero relative">
      <div className="v-container v-section flex min-h-[80vh] flex-col justify-center lg:min-h-screen">
        <div className="max-w-3xl">
          {brand ? (
            <span className="v-eyebrow">{brand}</span>
          ) : null}
          <h1
            className="v-heading mt-5 text-[clamp(2.25rem,5.5vw,4.5rem)] text-[var(--color-primary)]"
          >
            {tagline}
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-[color-mix(in_oklab,var(--color-primary)_75%,transparent)] sm:text-xl">
            {hero.subheadline}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a
              href={ctaHref(cta)}
              className="v-cta-primary inline-flex items-center gap-2"
            >
              <span>{cta.text}</span>
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </a>
            <a href="#contact" className="v-cta-secondary inline-flex items-center">
              Más información
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
