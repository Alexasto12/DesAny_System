import type { LandingContent } from '@desany/types';
import { getBrand } from '../lib/brand';

export function Footer({ content }: { content: LandingContent }) {
  const brand = getBrand(content.hero.headline);
  const year = new Date().getFullYear();

  return (
    <footer
      className="border-t"
      style={{
        borderColor: 'color-mix(in oklab, var(--color-primary) 10%, transparent)',
        background: 'var(--color-secondary)',
      }}
    >
      <div className="v-container flex flex-col items-start justify-between gap-4 py-10 sm:flex-row sm:items-center">
        <p className="v-heading text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
          {brand}
        </p>
        <p className="text-xs text-[color-mix(in_oklab,var(--color-primary)_55%,transparent)]">
          © {year} {brand}. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
