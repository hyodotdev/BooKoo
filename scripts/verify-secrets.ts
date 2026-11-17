import {execFileSync, spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

type SecretRule = {name: string; pattern: RegExp};

const tracked = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8'})
  .split('\0')
  .filter((path) => path !== '');
const forbiddenTracked = tracked.filter(
  (path) =>
    path.startsWith('.local/') ||
    path.startsWith('BooKooLegacy/') ||
    (/^\.env(?:\.|$)/.test(path) && path !== '.env.example') ||
    /(?:^|\/)(?:admin_key|service[-_]?account)[^/]*\.json$/i.test(path) ||
    /\.(?:jks|keystore|p12|p8|pem|key)$/i.test(path),
);
const requiredIgnoredPaths = [
  '.local/secret-verifier-probe',
  'BooKooLegacy/secret-verifier-probe',
  '.env.local',
];
const missingIgnores = requiredIgnoredPaths.filter((path) => {
  const result = spawnSync('git', ['check-ignore', '--quiet', '--', path]);
  return result.status !== 0;
});
const rules: SecretRule[] = [
  {
    name: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {name: 'google-api-key', pattern: /AIza[0-9A-Za-z_-]{35}/},
  {name: 'google-oauth-secret', pattern: /GOCSPX-[0-9A-Za-z_-]{20,}/},
  {
    name: 'github-token',
    pattern: /(?:ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{40,})/,
  },
  {name: 'slack-token', pattern: /xox[baprs]-[0-9A-Za-z-]{20,}/},
  {name: 'stripe-live-key', pattern: /[sr]k_live_[0-9A-Za-z]{20,}/},
  {name: 'sentry-token', pattern: /sntrys_[0-9A-Za-z_-]{20,}/},
  {name: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/},
];
const findings: string[] = [];

for (const path of tracked) {
  let contents: Buffer;

  try {
    contents = readFileSync(path);
  } catch {
    continue;
  }

  if (contents.length > 5 * 1024 * 1024 || contents.includes(0)) continue;
  const text = contents.toString('utf8');

  for (const rule of rules) {
    if (rule.pattern.test(text)) findings.push(`${path} (${rule.name})`);
  }
}

/**
 * Every `process.env.X` the shipped code reads must be documented in
 * `.env.example`, either as an assignable `X=` line or as a `#   X` entry in
 * the Convex-dashboard-only section.
 *
 * This exists because the failure it prevents is silent and expensive: a
 * production deployment configured from `.env.example` alone was missing the
 * App Store reviewer sign-in path, the OTP sender address, the migration
 * secret, and three social-login audiences. Nothing crashes — sign-in simply
 * fails for a platform, or a reviewer cannot get in and the build is rejected.
 */
const PLATFORM_PROVIDED = new Set(['NODE_ENV', 'CONVEX_SITE_URL']);
const ENV_SOURCE_DIRS = ['convex', 'src', 'app', 'shared'];

const envExample = readFileSync('.env.example', 'utf8');

/**
 * "Mentioned as a whole word anywhere in .env.example" — deliberately not a
 * layout match. The file documents names as `X=`, as `#   X  description`, and
 * as `#   X / Y / Z` lists; a regex tied to any one of those shapes fails on
 * the others and reports names that are in fact documented.
 */
const isDocumented = (name: string): boolean =>
  new RegExp(`\\b${name}\\b`).test(envExample);

const undocumentedEnv = new Set<string>();
for (const path of tracked) {
  if (!ENV_SOURCE_DIRS.some((dir) => path.startsWith(`${dir}/`))) continue;
  if (path.startsWith('convex/_generated/')) continue;
  if (!/\.(?:ts|tsx)$/.test(path)) continue;

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    const name = match[1];
    if (name === undefined) continue;
    if (PLATFORM_PROVIDED.has(name)) continue;
    if (!isDocumented(name)) undocumentedEnv.add(name);
  }
}

if (
  forbiddenTracked.length > 0 ||
  missingIgnores.length > 0 ||
  findings.length > 0 ||
  undocumentedEnv.size > 0
) {
  const details = [
    ...forbiddenTracked.map((path) => `${path} (forbidden tracked path)`),
    ...missingIgnores.map((path) => `${path} (must be ignored)`),
    ...findings,
    ...[...undocumentedEnv]
      .sort()
      .map((name) => `${name} (read by code, absent from .env.example)`),
  ];

  throw new Error(
    `secret snapshot verification failed:\n- ${details.join('\n- ')}`,
  );
}

process.stdout.write(
  `secrets: ${tracked.length} tracked files scanned; private paths are ignored; ` +
    `every process.env read is documented in .env.example\n`,
);
