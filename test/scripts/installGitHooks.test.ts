import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

/**
 * `scripts/install-git-hooks.sh` lets the commit hooks run the checkout's own
 * package scripts only on a state a person trusted with `bun install`. Each
 * line below was a review finding: an untrusted worktree, a skipped hook, a
 * merge in conflict, a stale validation record or a partial install must never
 * let unchecked code run on the next commit.
 */
describe('git hook trust', () => {
  let scratch: string;
  let report: string;

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'bookoo-hooks-'));
    report = execFileSync(
      'sh',
      [
        join(__dirname, '../fixtures/hooks/trust-scenarios.sh'),
        join(__dirname, '../../scripts/install-git-hooks.sh'),
        scratch,
      ],
      {encoding: 'utf8', env: {...process.env, GIT_CONFIG_GLOBAL: '/dev/null'}},
    );
  });
  afterAll(() => rmSync(scratch, {recursive: true, force: true}));

  it.each([
    ['1 never-trusted worktree', 'BLOCKED'],
    ['2 after bun install', 'ok'],
    ['3 next own commit', 'ok'],
    ['4 after a --no-verify commit', 'BLOCKED'],
    ['5a merge in conflict, HEAD unchanged', 'BLOCKED'],
    ['5b after review + bun install', 'ok'],
    ['5c next commit after the merge', 'ok'],
    ['6 clean cherry-pick in an untrusted worktree made trust', 'no'],
    ['8 --no-verify after a failed commit-msg, new content', 'BLOCKED'],
    ['9 --no-verify with the validated tree unchanged', 'ok'],
    ['10a squash merge staged, HEAD unchanged', 'BLOCKED'],
    ['10b after review + bun install', 'ok'],
    ['10c next commit after the squash', 'ok'],
    ['7 hooks beside a hand-made post-commit', 'post-commit'],
  ])('%s → %s', (scenario, expected) => {
    const line = report
      .split('\n')
      .find((candidate) => candidate.startsWith(scenario));
    expect(line?.replace(/^.*\): /, '').trim()).toBe(expected);
  });
});
