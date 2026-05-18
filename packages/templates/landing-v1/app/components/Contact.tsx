import type { LandingContent } from '@desany/types';
import { Phone, Mail, MapPin, ArrowUpRight } from 'lucide-react';
import { ctaHref } from '../lib/content';

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function Contact({ content }: { content: LandingContent }) {
  const { contact, cta } = content;
  const hasAny =
    !!contact.phone || !!contact.email || !!contact.address || !!contact.mapsEmbedUrl;
  if (!hasAny) return null;

  return (
    <section
      id="contact"
      className="v-section"
      style={{
        background:
          'color-mix(in oklab, var(--color-primary) 92%, var(--color-accent))',
        color: 'var(--color-secondary)',
      }}
    >
      <div className="v-container grid grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <span
            className="v-eyebrow"
            style={{ color: 'color-mix(in oklab, var(--color-secondary) 75%, transparent)' }}
          >
            Hablemos
          </span>
          <h2
            className="v-heading mt-4 text-[clamp(1.875rem,3.5vw,2.75rem)]"
            style={{ color: 'var(--color-secondary)' }}
          >
            Contacto
          </h2>
          <div
            className="v-divider mt-6"
            aria-hidden="true"
            style={{ background: 'var(--color-secondary)' }}
          />
          <ul role="list" className="mt-10 space-y-5">
            {contact.phone ? (
              <li>
                <a
                  href={telHref(contact.phone)}
                  className="group inline-flex items-start gap-4"
                >
                  <span
                    className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background:
                        'color-mix(in oklab, var(--color-secondary) 12%, transparent)',
                    }}
                  >
                    <Phone aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <span>
                    <span
                      className="block text-xs uppercase tracking-[0.18em]"
                      style={{ color: 'color-mix(in oklab, var(--color-secondary) 60%, transparent)' }}
                    >
                      Teléfono
                    </span>
                    <span className="block text-lg font-medium transition-opacity group-hover:opacity-80">
                      {contact.phone}
                    </span>
                  </span>
                </a>
              </li>
            ) : null}
            {contact.email ? (
              <li>
                <a
                  href={`mailto:${contact.email}`}
                  className="group inline-flex items-start gap-4"
                >
                  <span
                    className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background:
                        'color-mix(in oklab, var(--color-secondary) 12%, transparent)',
                    }}
                  >
                    <Mail aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <span>
                    <span
                      className="block text-xs uppercase tracking-[0.18em]"
                      style={{ color: 'color-mix(in oklab, var(--color-secondary) 60%, transparent)' }}
                    >
                      Email
                    </span>
                    <span className="block text-lg font-medium transition-opacity group-hover:opacity-80">
                      {contact.email}
                    </span>
                  </span>
                </a>
              </li>
            ) : null}
            {contact.address ? (
              <li className="inline-flex items-start gap-4">
                <span
                  className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background:
                      'color-mix(in oklab, var(--color-secondary) 12%, transparent)',
                  }}
                >
                  <MapPin aria-hidden="true" className="h-4 w-4" />
                </span>
                <span>
                  <span
                    className="block text-xs uppercase tracking-[0.18em]"
                    style={{ color: 'color-mix(in oklab, var(--color-secondary) 60%, transparent)' }}
                  >
                    Dirección
                  </span>
                  <span className="block text-lg font-medium">{contact.address}</span>
                </span>
              </li>
            ) : null}
          </ul>

          <a
            href={ctaHref(cta)}
            className="mt-10 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] underline underline-offset-8 transition-all hover:underline-offset-4"
          >
            {cta.text}
            <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>

        {contact.mapsEmbedUrl ? (
          <div className="lg:col-span-7">
            <div
              className="overflow-hidden"
              style={{
                borderRadius: 'var(--v-radius-lg, 1rem)',
                aspectRatio: '4 / 3',
              }}
            >
              <iframe
                title="Ubicación en el mapa"
                src={contact.mapsEmbedUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
