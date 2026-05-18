import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'src/templates');
const dest = resolve(root, 'dist/templates');

if (!existsSync(src)) {
  console.error(`source templates dir not found: ${src}`);
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`copied templates → ${dest}`);
