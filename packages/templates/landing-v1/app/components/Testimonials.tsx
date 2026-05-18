import type { LandingContent } from '@desany/types';
import { Star } from 'lucide-react';

function Stars({ rating }: { rating: number }) {
  const clamped = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div
      className="flex items-center gap-0.5"
      aria-label={`${clamped} de 5 estrellas`}
      role="img"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          className="h-4 w-4"
          fill={i < clamped ? 'currentColor' : 'none'}
          strokeWidth={1.5}
          style={{
            color:
              i < clamped
                ? 'var(--color-accent)'
                : 'color-mix(in oklab, var(--color-primary) 25%, transparent)',
          }}
        />
      ))}
    </div>
  );
}

export function Testimonials({ content }: { content: LandingContent }) {
  if (!content.testimonials?.length) return null;

  return (
    <section
      id="testimonials"
      className="v-section"
      style={{
        background:
          'color-mix(in oklab, var(--color-secondary) 70%, var(--color-accent))',
      }}
    >
      <div className="v-container">
        <header className="max-w-2xl">
          <span className="v-eyebrow">Confianza</span>
          <h2 className="v-heading mt-4 text-[clamp(1.875rem,3.5vw,2.75rem)] text-[var(--color-primary)]">
            Lo que dicen nuestros clientes
          </h2>
          <div className="v-divider mt-6" aria-hidden="true" />
        </header>

        <ul
          role="list"
          className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {content.testimonials.map((t, idx) => (
            <li key={`${t.author}-${idx}`} className="v-card flex flex-col p-7">
              <Stars rating={t.rating} />
              <blockquote className="mt-5 grow text-[15px] leading-relaxed text-[var(--color-primary)]">
                <p>&ldquo;{t.text}&rdquo;</p>
              </blockquote>
              <footer className="mt-6 text-sm font-medium text-[color-mix(in_oklab,var(--color-primary)_75%,transparent)]">
                — {t.author}
              </footer>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
