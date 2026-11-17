# Commit Changes

Complete workflow: branch → commit → push → PR.

## Usage

```
/commit [options]
```

**Options:**
- `--push` or `-p`: Push to remote after commit
- `--pr`: Create PR after push
- `--all` or `-a`: Commit all changes at once
- `<path>`: Commit only the specified path

## Examples

```bash
# Commit all and create PR
/commit --all --pr

# Just commit a specific path
/commit src/screens/ledger

# Commit and push
/commit --push
```

## Complete Workflow

### 1. Check Branch

```bash
git branch --show-current
```

**If on `main`** → create a feature branch first:

```bash
git checkout -b feat/<feature-name>
```

**If NOT on `main`** → proceed with commits directly.

**Branch naming conventions:**
- `feat/<feature-name>` — new features
- `bugfix/<bug-description>` — bug fixes
- `docs/<doc-update>` — documentation only
- `refactor/<description>` — refactoring
- `test/<description>` — test changes
- `chore/<task>` — maintenance tasks

For newly created branches, never use a tool or vendor prefix such as
`codex/`. Keep an existing branch name unless the user asks to rename it.

### 2. Check Current Status

```bash
git status
git diff --name-only
```

### 3. Stage Changes

**Specific path:**

```bash
git add <path>
```

**All changes:**

```bash
git add .
```

### 4. Review Staged Changes

```bash
git diff --cached --stat
git diff --cached --name-only
git diff --check
```

### 5. Pre-commit Checks

The `pre-commit` hook installed by `bun install` (`scripts/install-git-hooks.sh`)
runs `bun lint:all` and `bun typecheck`. Run the
full set manually first so failures surface before the commit attempt:

```bash
bun lint:all
bun typecheck
bun run test
```

`bun check` runs lint, typecheck and tests, but not all of `bun lint:all`.
Run `bun lint:all` separately. When `convex/` changed, also push
the functions once so the server-side typecheck runs:

```bash
bun dev:convex:once
```

If any check fails, fix it before committing. Never pass `--no-verify`.

### 6. Create Commit

Follow the conventional commit format:

```bash
git commit -m "$(cat <<'MSG'
<type>(<scope>): <description>

<body — what changed and why>
MSG
)"
```

**Commit types:**

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code refactoring |
| `chore` | Maintenance tasks |
| `test` | Adding or updating tests |

**Scope examples:**
- `ledger` — ledger and ledger membership
- `item` — ledger entries (income/expense)
- `calendar` — calendar and day sections
- `stats` — rollups, charts, dashboard
- `convex` — Convex backend
- `auth` — sign-in, username, account linking
- `ui` — shared components
- `i18n` — internationalization
- `config` — configuration and build

`commitlint.config.cjs` extends `@commitlint/config-conventional` and enforces a
500-character body line limit, except for `chore(deps)` / `chore(deps-dev)`.

### 7. Push to Remote

```bash
git push -u origin <branch-name>
```

### 8. Create Pull Request

Resolve the repository slug from the remote rather than hard-coding it:

```bash
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
gh label list --repo "$REPO" --limit 50
```

Select 1–3 existing labels that match the change. Never invent new labels.

```bash
gh pr create --title "<type>(<scope>): <description>" --body "$(cat <<'BODY'
## Summary

<1-3 bullet points describing the change>

## Changes

- Change 1
- Change 2

## Test plan

- [ ] `bun check` passes
- [ ] Works on iOS simulator
- [ ] Works on Android emulator
- [ ] Lists stay paginated (`$perf-audit`) when this touches a list or query
BODY
)"
```

Then attach the labels:

```bash
gh api "repos/$REPO/issues/<PR_NUMBER>/labels" --method POST \
  -f 'labels[]=<label1>' -f 'labels[]=<label2>'
```

Do not add agent attribution or generated-by footers to commits or PR bodies.

---

## Example Commit Messages

**Feature:**

```
feat(ledger): paginate the ledger timeline with day sections

- Add by_ledger_occurredAt index and paginated listItems query
- Render rows with FlashList + usePaginatedQuery + onEndReached
- Merge dailyRollups section headers client-side by dayKey
```

**Bug fix:**

```
fix(stats): read the month total from monthlyRollups

- Stop summing loaded items client-side, which was wrong at page boundaries
- Patch the rollup in the same mutation as the item write
```

---

## Quick Reference

```bash
git checkout -b feat/my-feature
git add .
git commit -m "feat(ledger): add my feature"
git push -u origin feat/my-feature
gh pr create --title "feat(ledger): add my feature" --body "..."
```
