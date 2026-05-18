#!/usr/bin/env tsx
/**
 * generate-site.ts
 *
 * Copies landing-v1 into an output directory, writes a content.json,
 * vendors @desany/types as a file: dep (so the build runs standalone
 * outside the pnpm workspace), runs `pnpm install` + `pnpm build`,
 * and prints the built `out/` directory on stdout for the caller.
 *
 * Usage:
 *   pnpm tsx scripts/generate-site.ts \
 *     --content fixtures/peluqueria-modern.json \
 *     --output /tmp/sites/42 \
 *     [--variant modern|elegant|bold]
 *
 * The deploy-service (workstream E) shells out to this script.
 *
 * Note: the original spec mentioned `pnpm install --prod`. We use a full
 * install instead because Next.js requires typescript + @types at build
 * time, which the template lists under devDependencies.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, join, relative, sep, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(__dirname, '../landing-v1');
const TYPES_DIR = resolve(__dirname, '../../types');

type Variant = 'modern' | 'elegant' | 'bold';

interface Args {
  content: string;
  output: string;
  variant?: Variant;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(`--${name}`);
    return idx === -1 ? undefined : argv[idx + 1];
  };
  const content = get('content');
  const output = get('output');
  const variant = get('variant') as Variant | undefined;

  if (!content || !output) {
    console.error(
      'Usage: tsx scripts/generate-site.ts --content <path> --output <dir> [--variant modern|elegant|bold]',
    );
    process.exit(2);
  }
  if (variant && !['modern', 'elegant', 'bold'].includes(variant)) {
    console.error(`Invalid --variant: ${variant}. Use modern, elegant, or bold.`);
    process.exit(2);
  }
  return {
    content: resolve(process.cwd(), content),
    output: resolve(process.cwd(), output),
    variant,
  };
}

function log(step: string): void {
  console.error(`[generate-site] ${step}`);
}

const NOISE = new Set(['node_modules', '.next', 'out', 'dist', '.turbo']);

function makeFilter(rootDir: string) {
  return (src: string): boolean => {
    if (src === rootDir) return true;
    const rel = relative(rootDir, src);
    if (!rel) return true;
    const segments = rel.split(sep);
    return !segments.some((s) => NOISE.has(s));
  };
}

function vendorTypes(destRoot: string): void {
  const vendored = join(destRoot, '.desany-types');
  mkdirSync(vendored, { recursive: true });

  cpSync(TYPES_DIR, vendored, {
    recursive: true,
    filter: makeFilter(TYPES_DIR),
  });

  // Produce a runnable dist/ without spawning tsc:
  // @desany/types contains only interfaces/types, so dist/index.js can be a
  // no-op ESM module and dist/index.d.ts can be the verbatim source.
  const srcFile = join(vendored, 'src', 'index.ts');
  if (!existsSync(srcFile)) {
    throw new Error(`Expected @desany/types source at ${srcFile}`);
  }
  const typeSource = readFileSync(srcFile, 'utf8');
  const distDir = join(vendored, 'dist');
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, 'index.d.ts'), typeSource);
  writeFileSync(join(distDir, 'index.js'), 'export {};\n');

  // Ensure exports map points to dist files (it already does in the source)
  const pkgPath = join(vendored, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
  // Remove devDeps so the file: dep resolves cleanly
  delete pkg.devDependencies;
  delete pkg.scripts;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function patchTemplatePackageJson(destRoot: string): void {
  const pkgPath = join(destRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    pnpm?: Record<string, unknown>;
  };
  pkg.dependencies = pkg.dependencies ?? {};
  pkg.dependencies['@desany/types'] = 'file:./.desany-types';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function writeContent(destRoot: string, contentPath: string, variant?: Variant): void {
  const raw = readFileSync(contentPath, 'utf8');
  const data = JSON.parse(raw) as Record<string, unknown>;
  if (variant) {
    data.styleVariant = variant;
  }
  writeFileSync(join(destRoot, 'content.json'), JSON.stringify(data, null, 2) + '\n');
}

function run(cmd: string, cwd: string): void {
  log(`$ ${cmd}  (cwd: ${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function main(): void {
  const args = parseArgs();

  if (!existsSync(args.content)) {
    throw new Error(`Content file not found: ${args.content}`);
  }
  if (!existsSync(TEMPLATE_DIR)) {
    throw new Error(`Template directory not found: ${TEMPLATE_DIR}`);
  }
  if (!existsSync(TYPES_DIR)) {
    throw new Error(`Types package not found: ${TYPES_DIR}`);
  }

  log(`Output: ${args.output}`);
  log(`Content: ${args.content}`);
  if (args.variant) log(`Variant override: ${args.variant}`);

  mkdirSync(args.output, { recursive: true });

  log(`Copy template from ${TEMPLATE_DIR}`);
  cpSync(TEMPLATE_DIR, args.output, {
    recursive: true,
    filter: makeFilter(TEMPLATE_DIR),
  });

  log('Vendor @desany/types');
  vendorTypes(args.output);

  log('Patch template package.json to use file: dep');
  patchTemplatePackageJson(args.output);

  log('Write content.json');
  writeContent(args.output, args.content, args.variant);

  run('pnpm install --ignore-workspace', args.output);
  run('pnpm build', args.output);

  const builtPath = join(args.output, 'out');
  log(`Build complete: ${builtPath}`);
  // Final stdout line is the built path so callers can pipe it.
  console.log(builtPath);
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[generate-site] FAILED: ${message}`);
  process.exit(1);
}
