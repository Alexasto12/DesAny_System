import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { VercelFile } from './vercel.js';

export async function collectFiles(rootDir: string): Promise<VercelFile[]> {
  const absoluteRoot = path.resolve(rootDir);
  const files: VercelFile[] = [];
  await walk(absoluteRoot, absoluteRoot, files);
  return files;
}

async function walk(root: string, current: string, out: VercelFile[]): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(current, entry.name);

    if (entry.isDirectory()) {
      await walk(root, full, out);
      continue;
    }

    if (!entry.isFile()) continue;

    const data = await fs.readFile(full);
    const relative = path.relative(root, full).split(path.sep).join('/');
    out.push({ file: relative, data });
  }
}
