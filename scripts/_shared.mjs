import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, '..');

export function loadEnvFile(filename) {
  const filePath = path.join(projectRoot, filename);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const source = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

export function initEnv() {
  loadEnvFile('.env');
  loadEnvFile('.env.local');
}

export function writeJson(relativePath, value) {
  const filePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseHashtags(value) {
  const matches = [...String(value ?? '').matchAll(/(^|\s)#([\p{L}\p{N}_-]+)/gu)];
  return [...new Set(matches.map((match) => match[2].toLowerCase()))];
}

export function stripHtml(value) {
  return cleanText(String(value ?? '').replace(/<[^>]+>/g, ' '));
}

export function normalizeTitle(value) {
  return cleanText(String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' '));
}

export async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
