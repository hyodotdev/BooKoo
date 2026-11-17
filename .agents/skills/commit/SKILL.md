---
name: commit
description: Commit BooKoo repository changes safely. Use when the user runs `/commit` or `$commit`, asks to commit, push, or open a PR. Handles branch checks, conventional commit messages, validation, staging, push, and optional PR creation.
---

# Commit

Use `references/workflow.md` as the detailed branch, commit, push, and PR checklist.

## Workflow

1. Inspect `git status --short`, the current branch, and the relevant diffs.
2. Never stage or revert unrelated user changes.
3. If on `main`, create a semantic branch first — `feat/`, `bugfix/`, `docs/`,
   `refactor/`, `test/`, or `chore/`. Never a tool or vendor prefix.
4. If committing, use Angular Conventional Commits: `<type>(<scope>): <subject>`.
5. Run the checks the touched paths require before committing:
   - `bun lint:all`
   - `bun typecheck`
   - `bun run test`
   - `bun check` runs lint, typecheck and tests; `bun lint:all` is still required.
   The `pre-commit` hook that `bun install` installs (`scripts/install-git-hooks.sh`)
   runs `bun lint:all` and `bun typecheck`, and `commit-msg` runs commitlint, so a
   commit that skips them still fails. The hooks only run on the state this
   worktree trusted: after a checkout, pull, rebase or merge they stop with "this
   worktree changed since it was trusted" — review what changed, then run
   `bun install`.
   Never use `--no-verify`.
6. Stage only the intended files unless the user explicitly asks for all changes.
7. Do not add agent attribution or generated-by footers.
8. Push or create a PR only when the user asks for it. PR creation is not
   complete until 1–3 existing labels are attached and confirmed on the PR.

## BooKoo Gates

- A diff that adds or changes a list screen, a Convex query, or a schema table
  must pass `$perf-audit` before it is committed. Unbounded lists are the
  documented failure mode of the legacy app.
- Money stays in integer minor units (`amountMinor`); a commit that introduces a
  float or string amount is wrong regardless of what the tests say.
- New user-facing strings belong in `assets/langs/` with static keys. Never
  commit a dynamic i18n key.

## Reference

Read `references/workflow.md` when the request needs the full branch, push,
label, or PR workflow.
