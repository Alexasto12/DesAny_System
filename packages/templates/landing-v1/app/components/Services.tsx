import type { LandingContent } from '@desany/types';
import { pickIcon } from '../lib/icons';

export function Services({ content }: { content: LandingContent }) {
  if (!content.services?.length) return null;

  return (
    <section id="services" className="v-section">
      <div className="v-container">
        <header className="max-w-2xl">
          <span className="v-eyebrow">Lo que ofrecemos</span>
          <h2 className="v-heading mt-4 text-[clamp(1.875rem,3.5vw,2.75rem)] text-[var(--color-primary)]">
            Servicios
          </h2>
          <div className="v-divider mt-6" aria-hidden="true" />
        </header>

        <ul
          role="list"
          className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {content.services.map((service, idx) => {
            const Icon = pickIcon(service.name, service.icon);
            return (
              <li key={`${service.name}-${idx}`} className="v-card p-7">
                <div
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{
                    background:
                      'color-mix(in oklab, var(--color-accent) 18%, transparent)',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Icon aria-hidden="true" className="h-6 w-6" />
                </div>
                <h3 className="v-heading mt-5 text-xl text-[var(--color-primary)]">
                  {service.name}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[color-mix(in_oklab,var(--color-primary)_70%,transparent)]">
                  {service.description}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
