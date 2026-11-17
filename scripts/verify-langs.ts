import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {SUPPORTED_LOCALES} from '../shared/locales';

interface JsonObject {
  [key: string]: string | JsonObject;
}

const ROOT = process.cwd();
const LOCALES = SUPPORTED_LOCALES;
const REFERENCE = 'ko';
const PLACEHOLDER = /\{\{\s*[\w.]+\s*\}\}|%\{[\w.]+\}/g;
const PLURAL_SUFFIX = /\.(zero|one|other)$/;

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every(
    (child) => typeof child === 'string' || isJsonObject(child),
  );

const readJsonObject = (path: string): JsonObject => {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));

  if (!isJsonObject(parsed)) {
    throw new Error(`${path}: expected a nested object containing strings`);
  }

  return parsed;
};

const flatten = (value: JsonObject, prefix = ''): Map<string, string> => {
  const result = new Map<string, string>();

  for (const [key, child] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;

    if (typeof child === 'string') {
      result.set(path, child);
    } else {
      for (const [nestedPath, message] of flatten(child, path)) {
        result.set(nestedPath, message);
      }
    }
  }

  return result;
};

const placeholders = (message: string): string =>
  (message.match(PLACEHOLDER) ?? [])
    .map((token) => token.replace(/[%{}\s]/g, ''))
    .sort()
    .join(',');

const keySignature = (messages: Map<string, string>): string =>
  [...messages.keys()].sort().join('\n');

const failures: string[] = [];
const appMessages = new Map(
  LOCALES.map((locale) => [
    locale,
    flatten(readJsonObject(join(ROOT, 'assets', 'langs', `${locale}.json`))),
  ]),
);
const metaMessages = new Map(
  LOCALES.map((locale) => [
    locale,
    flatten(
      readJsonObject(join(ROOT, 'assets', 'langs', 'meta', `${locale}.json`)),
    ),
  ]),
);
const reference = appMessages.get(REFERENCE);
const metaReference = metaMessages.get(REFERENCE);

if (reference === undefined || metaReference === undefined) {
  throw new Error('reference locale is missing');
}

if (reference.size <= 200) {
  failures.push(
    `app locale set is unexpectedly small (${reference.size} keys)`,
  );
}

const pluralPaths = new Set(
  [...reference.keys()]
    .filter((key) => PLURAL_SUFFIX.test(key))
    .map((key) => key.replace(PLURAL_SUFFIX, '')),
);

if (pluralPaths.size === 0) {
  failures.push('no plural entries were found');
}

for (const locale of LOCALES) {
  const messages = appMessages.get(locale);
  const metadata = metaMessages.get(locale);

  if (messages === undefined || metadata === undefined) {
    failures.push(`${locale}: locale file is missing`);
    continue;
  }

  if (keySignature(messages) !== keySignature(reference)) {
    failures.push(`${locale}: app key set differs from ${REFERENCE}`);
  }
  if (keySignature(metadata) !== keySignature(metaReference)) {
    failures.push(`${locale}: metadata key set differs from ${REFERENCE}`);
  }

  for (const [key, message] of messages) {
    if (key.includes('-'))
      failures.push(`${locale}:${key}: key contains a hyphen`);
    if (message.trim() === '') failures.push(`${locale}:${key}: empty message`);
    if (placeholders(message) !== placeholders(reference.get(key) ?? '')) {
      failures.push(
        `${locale}:${key}: placeholder set differs from ${REFERENCE}`,
      );
    }
  }

  for (const [key, message] of metadata) {
    if (message.trim() === '')
      failures.push(`${locale}:meta:${key}: empty value`);
  }

  for (const path of pluralPaths) {
    if (!messages.has(`${path}.other`)) {
      failures.push(`${locale}:${path}: missing plural form "other"`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`language verification failed:\n- ${failures.join('\n- ')}`);
}

process.stdout.write(
  `languages: ${LOCALES.length} locales, ${reference.size} app keys, ` +
    `${metaReference.size} metadata keys verified\n`,
);
