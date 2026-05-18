import type { LandingContent } from '@desany/types';

export function About({ content }: { content: LandingContent }) {
  if (!content.about?.trim()) return null;

  // Split into paragraphs by blank lines for nice typography
  const paragraphs = content.about
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <section id="about" className="v-section">
      <div className="v-container grid grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <span className="v-eyebrow">Nuestra historia</span>
          <h2 className="v-heading mt-4 text-[clamp(1.875rem,3.5vw,2.75rem)] text-[var(--color-primary)]">
            Sobre nosotros
          </h2>
          <div className="v-divider mt-6" aria-hidden="true" />
        </div>
        <div className="space-y-5 text-[17px] leading-[1.75] text-[color-mix(in_oklab,var(--color-primary)_80%,transparent)] lg:col-span-8">
          {paragraphs.length > 0 ? (
            paragraphs.map((p, i) => <p key={i}>{p}</p>)
          ) : (
            <p>{content.about}</p>
          )}
        </div>
      </div>
    </section>
  );
}
