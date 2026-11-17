import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = process.cwd();
const failures: string[] = [];

const migrationEmail = join(ROOT, 'scripts', 'migrate', 'lib', 'email.ts');
const sharedEmail = join(ROOT, 'shared', 'email.ts');
if (existsSync(migrationEmail)) {
  if (!existsSync(sharedEmail)) {
    failures.push(
      'migration email normalizer exists but shared/email.ts is missing',
    );
  } else if (
    readFileSync(migrationEmail).compare(readFileSync(sharedEmail)) !== 0
  ) {
    failures.push(
      'scripts/migrate/lib/email.ts must be byte-identical to shared/email.ts',
    );
  }
}

if (failures.length > 0) {
  throw new Error(`readiness verification failed:\n- ${failures.join('\n- ')}`);
}

process.stdout.write(`readiness: migration email normalizer matches shared\n`);
