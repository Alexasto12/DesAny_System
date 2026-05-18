# @desany/templates

Landing-page templates rendered from a `LandingContent` JSON document.

The current shipping template is **`landing-v1`** — a single-page Next.js 15
(App Router) site with three style variants and static export. The
`generate-site` script copies it, writes the per-tenant `content.json`, and
produces a deploy-ready `out/` directory.

```
packages/templates/
├── landing-v1/         # Next.js 15 + Tailwind v4 + shadcn-style components
├── scripts/
│   └── generate-site.ts
└── docs/screenshots/   # variant screenshots (added in dev QA)
```

---

## What the template renders

Every field of the `LandingContent` type (see `packages/types/src/index.ts`)
maps to a section of the page:

| Field                           | Where it appears                                  | Required |
| ------------------------------- | ------------------------------------------------- | -------- |
| `hero.headline`                 | `<h1>` in Hero. Optional `"Brand — Tagline"` split surfaces a brand eyebrow + tagline. | yes      |
| `hero.subheadline`              | Lead paragraph below the headline                 | yes      |
| `services[].name`               | Card title                                        | yes      |
| `services[].description`        | Card body                                         | yes      |
| `services[].icon`               | Optional hint for icon picker (keyword match)     | no       |
| `testimonials[].text`           | Quote text                                        | yes      |
| `testimonials[].author`         | Quote attribution                                 | yes      |
| `testimonials[].rating`         | Renders 1–5 star row (clamped, rounded)           | yes      |
| `about`                         | About section. Blank lines split into paragraphs. | yes      |
| `cta.text`                      | Label on the hero + contact CTAs                  | yes      |
| `cta.action` + `cta.target`     | `phone` → `tel:`, `email` → `mailto:`, `contact-form` → in-page anchor | yes |
| `contact.phone`                 | Linked `tel:` row in Contact                      | no       |
| `contact.email`                 | Linked `mailto:` row in Contact                   | no       |
| `contact.address`               | Static row in Contact                             | no       |
| `contact.mapsEmbedUrl`          | Iframe (Google Maps embed format) in Contact     | no       |
| `colors.primary`                | Inlined as `--color-primary` on `<html>`          | yes      |
| `colors.secondary`              | Inlined as `--color-secondary` on `<html>`        | yes      |
| `colors.accent`                 | Inlined as `--color-accent` on `<html>`           | yes      |
| `styleVariant`                  | Set on `<html data-variant="…">` to switch theme  | yes      |

### Sections

| Section       | Component                                  | Notes |
| ------------- | ------------------------------------------ | ----- |
| Hero          | `app/components/Hero.tsx`                  | Full-viewport on `lg+`. CTA label + secondary "Más información" anchor. |
| Services      | `app/components/Services.tsx`              | 1 col mobile, 2 col `md`, 3 col `lg`. Icons picked by `pickIcon()` keyword match against `services[].name` (or `.icon` hint). |
| About         | `app/components/About.tsx`                 | 12-col grid `lg+`, paragraph-split on blank lines. |
| Testimonials  | `app/components/Testimonials.tsx`          | Grid layout (not a carousel — keeps static export JS-free). |
| Contact       | `app/components/Contact.tsx`               | Optional rows; Maps iframe takes the right column on `lg+`. |
| Footer        | `app/components/Footer.tsx`                | Brand mark (derived from headline) + © year. |

### Style variants

Switched by `<html data-variant="…">`. All variant-specific values are CSS
custom properties on `[data-variant='…']` in `app/styles/variants.css`, so
the preview page can nest multiple variants side-by-side via wrapper divs.

| Variant   | Font                          | Look                                                 |
| --------- | ----------------------------- | ---------------------------------------------------- |
| `modern`  | Inter                         | Soft shadows, `rounded-2xl`, subtle gradients, lots of whitespace. |
| `elegant` | Playfair Display + Inter      | Muted earth palette, generous letter-spacing, serif headings. |
| `bold`    | Space Grotesk                 | High contrast, geometric `clip-path` shapes, tight padding. |

---

## Preview the template locally

```bash
cd packages/templates/landing-v1
pnpm install
cp fixtures/peluqueria-modern.json content.json
pnpm dev
# open http://localhost:3000
```

`pnpm dev` falls back to `fixtures/peluqueria-modern.json` if `content.json`
is missing, so the very first run does not need the copy step.

### Variant QA — all 3 fixtures side by side

```bash
pnpm dev
# open http://localhost:3000/preview
```

The `/preview` route renders the three shipping fixtures stacked, each in
its own variant scope. Use it as a smoke test when changing variant tokens
or components.

### Fixtures

| File                                | Variant   | Business shape       |
| ----------------------------------- | --------- | -------------------- |
| `fixtures/peluqueria-modern.json`   | `modern`  | Hair salon (CDMX)    |
| `fixtures/boutique-elegant.json`    | `elegant` | Boutique (Barcelona) |
| `fixtures/tattoo-bold.json`         | `bold`    | Tattoo studio (CDMX) |

---

## Generate a tenant site

The deploy-service (workstream E) shells out to this script. From the repo
root:

```bash
pnpm --filter @desany/templates exec tsx scripts/generate-site.ts \
  --content packages/templates/landing-v1/fixtures/peluqueria-modern.json \
  --output  /tmp/sites/42 \
  --variant modern        # optional, overrides content.styleVariant
```

What it does:

1. Copy `landing-v1/` → `/tmp/sites/42/` (skipping `node_modules/`, `.next/`, `out/`, `dist/`).
2. Vendor `@desany/types` into `/tmp/sites/42/.desany-types/` and rewrite the template's `package.json` to `"@desany/types": "file:./.desany-types"`, so the build runs standalone outside the pnpm workspace.
3. Write `content.json` (applying `--variant` override if provided).
4. `pnpm install --ignore-workspace` inside the output directory.
5. `pnpm build` (Next.js static export — produces `out/`).
6. Print the absolute path of `out/` on the final line of stdout.

> **Why not `pnpm install --prod`?** Next.js needs `typescript` and `@types/*` at build time; the template ships them under `devDependencies`. Using `--prod` would break the build.

---

## Screenshots

Add screenshots to `docs/screenshots/` and reference them here for design QA.

![Modern variant — peluqueria fixture](docs/screenshots/modern.png)
![Elegant variant — boutique fixture](docs/screenshots/elegant.png)
![Bold variant — tattoo fixture](docs/screenshots/bold.png)

---

## Out of scope

- No backend, forms, auth or database. CTAs are `tel:` / `mailto:` / in-page anchors.
- No Vercel deploy logic (workstream E).
- No LLM calls (workstream C produces `content.json`; this template only renders it).
