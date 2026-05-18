import type { ReactNode, CSSProperties } from 'react';
import type { Metadata } from 'next';
import { inter, playfair, spaceGrotesk } from './lib/fonts';
import { getContent } from './lib/content';
import { getBrand } from './lib/brand';
import './globals.css';

export function generateMetadata(): Metadata {
  const content = getContent();
  const brand = getBrand(content.hero.headline);
  return {
    title: brand,
    description: content.hero.subheadline,
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const content = getContent();

  const cssVars: CSSProperties = {
    ['--color-primary' as string]: content.colors.primary,
    ['--color-secondary' as string]: content.colors.secondary,
    ['--color-accent' as string]: content.colors.accent,
  };

  return (
    <html
      lang="es"
      data-variant={content.styleVariant}
      style={cssVars}
      className={`${inter.variable} ${playfair.variable} ${spaceGrotesk.variable}`}
    >
      <body className="v-root antialiased">{children}</body>
    </html>
  );
}
