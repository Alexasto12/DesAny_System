import Handlebars from 'handlebars';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, 'templates');

export type Language = 'en' | 'es';

export interface RenderVars {
  businessName: string;
  city: string;
  category: string;
  siteUrl: string;
  senderName: string;
  senderTitle: string;
}

export interface SubjectsFile {
  en: string[];
  es: string[];
}

function templatePath(language: Language): string {
  return resolve(TEMPLATES_DIR, `cold-v1-${language}.hbs`);
}

export async function loadSubjects(): Promise<SubjectsFile> {
  const raw = await readFile(resolve(TEMPLATES_DIR, 'subjects.json'), 'utf8');
  return JSON.parse(raw) as SubjectsFile;
}

export async function pickSubject(language: Language, vars: RenderVars): Promise<string> {
  const subjects = await loadSubjects();
  const list = subjects[language] ?? subjects.en;
  if (!list || list.length === 0) {
    throw new Error(`No subjects configured for language: ${language}`);
  }
  const chosen = list[Math.floor(Math.random() * list.length)];
  return Handlebars.compile(chosen, { noEscape: true })(vars);
}

export async function renderBody(language: Language, vars: RenderVars): Promise<string> {
  const raw = await readFile(templatePath(language), 'utf8');
  const template = Handlebars.compile(raw, { noEscape: false });
  return template(vars);
}

export function appendTrackingPixel(html: string, trackingUrl: string): string {
  const pixel = `<img src="${trackingUrl}" width="1" height="1" alt="" style="display:block;border:0;outline:none" />`;
  return `${html}\n${pixel}\n`;
}
