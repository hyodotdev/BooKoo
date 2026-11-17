#!/bin/sh
# Drives scripts/install-git-hooks.sh through its trust scenarios in throwaway
# repositories. $1 = installer path, $2 = an empty scratch directory. `bun` and
# `bunx` are stubs (FAIL_MSG makes commit-msg fail), so only the trust logic runs.
# Prints one "N label: ok|BLOCKED|no|<hooks>" line per scenario.
set -u
INSTALLER="$1"
T="$2"
mkdir -p "$T/bin" "$T/repo" "$T/repo7"
printf '#!/bin/sh\nexit 0\n' >"$T/bin/bun"
printf '#!/bin/sh\n[ -n "${FAIL_MSG:-}" ] && exit 1\nexit 0\n' >"$T/bin/bunx"
chmod +x "$T/bin/bun" "$T/bin/bunx"
PATH="$T/bin:$PATH"
export PATH GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

r() { if "$@" >/dev/null 2>&1; then echo ok; else echo BLOCKED; fi; }

cd "$T/repo" || exit 1
git -c init.defaultBranch=main init -q
mkdir scripts && cp "$INSTALLER" scripts/install-git-hooks.sh
echo a >f && git add . && git commit -q --no-verify -m init
inst() { sh scripts/install-git-hooks.sh; }

inst
mv .git/bookoo-trusted-state "$T/moved-trust"
echo b >>f && git add f
echo "1 never-trusted worktree (want BLOCKED): $(r git commit -m 'feat: x')"
inst
echo "2 after bun install (want ok): $(r git commit -m 'feat: x')"
echo c >>f && git add f
echo "3 next own commit (want ok): $(r git commit -m 'feat: y')"
git commit -q --allow-empty --no-verify -m 'feat: nv'
echo d >>f && git add f
echo "4 after a --no-verify commit (want BLOCKED): $(r git commit -m 'feat: z')"
inst && git commit -q -m 'feat: z'
git switch -q -c other && echo X >f && git commit -q --no-verify -am 'feat: other'
git switch -q main && inst && echo Y >f && git commit -q -am 'feat: main side'
git merge other >/dev/null 2>&1
echo Z >f && git add f
echo "5a merge in conflict, HEAD unchanged (want BLOCKED): $(r git commit -m 'feat: merge')"
inst
echo "5b after review + bun install (want ok): $(r git commit -m 'feat: merge')"
echo e >>f && git add f
echo "5c next commit after the merge (want ok): $(r git commit -m 'feat: after')"
echo f >>f && git add f && git commit -q -m 'feat: pickme'
git worktree add -q "$T/wt2" HEAD~1 2>/dev/null
(cd "$T/wt2" && git cherry-pick main >/dev/null 2>&1
 echo "6 clean cherry-pick in an untrusted worktree made trust (want no): $([ -s "$(git rev-parse --absolute-git-dir)/bookoo-trusted-state" ] && echo YES || echo no)")

cd "$T/repo" || exit 1
inst
echo g >>f && git add f
FAIL_MSG=1 git commit -m 'feat: msg fails' >/dev/null 2>&1
echo h >>f && git add f
git commit -q --no-verify -m 'feat: unchecked content'
echo i >>f && git add f
echo "8 --no-verify after a failed commit-msg, new content (want BLOCKED): $(r git commit -m 'feat: next')"
inst
echo j >>f && git add f
FAIL_MSG=1 git commit -m 'feat: msg fails' >/dev/null 2>&1
git commit -q --no-verify -m 'feat: same validated tree'
echo k >>f && git add f
echo "9 --no-verify with the validated tree unchanged (want ok): $(r git commit -m 'feat: next')"

cd "$T/repo" || exit 1
inst
git switch -q -c squashed && echo S >>f && git commit -q --no-verify -am 'feat: squashed side'
git switch -q main && inst
git merge --squash squashed >/dev/null 2>&1
echo "10a squash merge staged, HEAD unchanged (want BLOCKED): $(r git commit -m 'feat: squash')"
inst
echo "10b after review + bun install (want ok): $(r git commit -m 'feat: squash')"
echo l >>f && git add f
echo "10c next commit after the squash (want ok): $(r git commit -m 'feat: after squash')"

cd "$T/repo7" || exit 1
git -c init.defaultBranch=main init -q
mkdir scripts && cp "$INSTALLER" scripts/install-git-hooks.sh
printf '#!/bin/sh\nexit 0\n' >.git/hooks/post-commit && chmod +x .git/hooks/post-commit
sh scripts/install-git-hooks.sh 2>&1 | sed 's/^/   /'
echo "7 hooks beside a hand-made post-commit (want only post-commit): $(ls .git/hooks | grep -v sample | tr '\n' ' ')"
