# 05 — Martie repo-tooling + AI-agent-config recipe (for BooKoo)

Research date: 2026-08-24
Primary source: `/Users/hyo/Github/hyodotdev/Martie` (git branch `main`)
Secondary sources (stack-closer to BooKoo): `/Users/hyo/Github/hyodotdev/FightingHows`,
`/Users/hyo/Github/crossplatformkorea/cpk-ui`

> **Read this first.** Martie is the *agent-config* reference (it has the newest
> `.agents/` SSOT + `sync-skills.sh` mirroring). **FightingHows is the *stack*
> reference** — it is already Expo SDK 57 + expo-router typed routes + Convex +
> `@convex-dev/auth` + cpk-ui + kstyled + FlashList/`usePaginatedQuery`, i.e.
> exactly BooKoo's target stack. Where the two disagree on a build config, take
> FightingHows. Where they disagree on agent config, take Martie.

---

## 0. Executive answer to the three questions

1. **How skills are authored once and mirrored** — canonical body lives at
   `.agents/skills/<name>/SKILL.md`; `bash .agents/scripts/sync-skills.sh`
   generates thin pointer `SKILL.md` files into `.claude/skills/<name>/`,
   `.codex/skills/<name>/`, `.grok/skills/<name>/`. Pointers carry the *same*
   `name` + `description` frontmatter (so triggers are identical across agents)
   and differ only in an agent-specific "Notes" section. The script also prunes
   pointers whose canonical skill was deleted. Full verbatim contents in §2.

2. **Cursor** — **not supported anywhere.** No `.cursor/`, no `.cursorrules`, no
   `*.mdc` in Martie, FightingHows, or cpk-ui (verified by `find` + `git ls-files`).
   BooKoo must add it. Designed `.cursor/rules/<name>.mdc` pointer format and the
   `sync-skills.sh` extension that emits it are in §4.

3. **Deliverable** — the step-by-step, file-by-file recipe for BooKoo is §9.

---

## 1. Inventory: what exists where

### 1.1 Martie root (agent + tooling files only)

```
/Users/hyo/Github/hyodotdev/Martie/
├── .agents/
│   ├── README.md                       (2760 bytes)
│   ├── scripts/sync-skills.sh
│   └── skills/<13 skills>/SKILL.md [+ references/ +scripts/]
├── .claude/
│   ├── settings.json                   (66 bytes — bypassPermissions only)
│   ├── settings.local.json             (21482 bytes, gitignored)
│   └── skills/<12 pointers>/SKILL.md
├── .codex/skills/<12 pointers>/SKILL.md + agents/openai.yaml
├── .grok/skills/<12 pointers>/SKILL.md
├── .cpk/expo                           (cpk-cli marker file)
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/{ci.yml, deploy.yml}
├── .husky/{pre-commit, commit-msg}
├── .vscode/{settings.json, extensions.json, launch.json, mcp.json, cpk.code-snippets}
├── .jest/cache/                        (jest cacheDirectory, gitignored)
├── __mocks__/{convex/{react.tsx,http.ts}, expo-asset.ts, expo-localization.ts,
│              react-native-reanimated.js, react-native-worklets.js, sentry-expo.ts}
├── @types/jsx.d.ts
├── test/{testSetup.ts, testSetupAfterEnv.ts, testUtils.tsx, ...}
├── AGENTS.md                           (1574 bytes)
├── CLAUDE.md                           (3449 bytes)
├── .eslintrc.js  .eslintignore  .prettierrc.js
├── tsconfig.json  jest.config.ts  metro.config.js  babel.config.js
├── app.config.ts  eas.json  environment.d.ts  expo-env.d.ts  config.ts
├── commitlint.config.cjs  .ncurc.json  .easignore  .gitignore
├── custom-syntax-validator.ts
├── .env.sample  .env.local  .env.development  .env.preview  .env.production  .env.prod
└── scripts/{build-vega.sh, generateQuizFile.mjs, inputs.mjs, quizzesOrganizer.ts,
             quizPrompt.md, locales/, quizzes/, _seeds/, package.json, tsconfig.json}
```

**Notable absences in Martie**: there is **no** `.claude/commands/`, **no**
`.claude/agents/`, **no** `.cursor/`, **no** `.cursorrules`, **no** `.mcp.json`
at root (MCP is declared in `.vscode/mcp.json` instead).

### 1.2 Martie skill list (13 canonical, 12 mirrored)

`.agents/skills/grow/` exists canonically and IS mirrored (13th dir appears in
`.claude/skills` listing as `grow`). Skill inventory + line counts:

| Skill | canonical lines | has `references/` | has `scripts/` | reusable for BooKoo? |
|---|---|---|---|---|
| `analyze` | 70 | `firebase-ga4.md`, `metric-playbook.md` | `analyze_martie_metrics.py` | later (growth) |
| `commit` | 25 | `workflow.md` (199) | — | **YES, verbatim-ish** |
| `e2e-test` | 199 | `workflow.md` (200) | — | **YES, rewrite for BooKoo flows** |
| `grow` | 172 | — | — | later |
| `loop-review` | 175 | — | — | **YES, verbatim-ish** |
| `release-update` | 101 | — | — | **YES, adapt** |
| `render-shorts` | 22 | `workflow.md` (346) | — | no |
| `review-pr` | 25 | `workflow.md` (66) | — | **YES** |
| `review-self` | 116 | — | — | **YES, verbatim-ish** |
| `seed-articles` | 22 | `workflow.md` (221) | — | adapt → `seed-ledger` |
| `seed-quizzes` | 22 | `workflow.md` (225) | — | no |
| `update-version` | 20 | `workflow.md` (59) | — | **YES** |

### 1.3 FightingHows — the OLDER mirroring pattern (do not copy)

FightingHows uses **symlinks** instead of generated pointers and has **no**
`sync-skills.sh`:

```
.claude/commands/commit.md      -> ../../.agents/skills/commit/SKILL.md   (symlink)
.codex/skills/commit/SKILL.md   (hand-written thin adapter, ~20 lines)
.codex/skills/commit/references/workflow.md -> ../../../../.agents/skills/commit/SKILL.md (symlink)
.codex/skills/commit/agents/openai.yaml
.grok/{README.md, agents/convex.md, agents/mobile-ui.md}   ← Grok subagents, NOT skills
```

Two things from FightingHows **are worth stealing**:
- **Per-directory `AGENTS.md`** (`app/AGENTS.md`, `src/AGENTS.md`,
  `convex/AGENTS.md`) — short scope-local rule sheets. Verbatim in §5.4.
- **Domain subagents** (`.grok/agents/convex.md`, `.grok/agents/mobile-ui.md`) —
  frontmatter + tight rule list, restricted to a directory. Verbatim in §5.5.
  Same file body works as `.claude/agents/<name>.md`.

---

## 2. `.agents/` — the SSOT and the sync mechanism

### 2.1 `.agents/README.md` (Martie, verbatim)

````markdown
# Agent Skills

One skill set, shared by every coding agent used on Martie.

## Layout

```text
.agents/skills/<name>/SKILL.md        # canonical definition (edit only here)
.agents/skills/<name>/references/     # long-form procedures the SKILL.md links
.agents/skills/<name>/scripts/        # helper scripts the SKILL.md links
.agents/scripts/sync-skills.sh        # regenerates every pointer below

.claude/skills/<name>/SKILL.md        # pointer, Claude Code notes
.codex/skills/<name>/SKILL.md         # pointer, Codex notes
.codex/skills/<name>/agents/openai.yaml  # Codex-only interface metadata
.grok/skills/<name>/SKILL.md          # pointer, Grok notes
```

Each agent discovers skills from its own directory, so all three see the same
names, the same `description` triggers, and the same procedure. Only the short
"Notes" section differs — it maps agent-neutral instructions (`$name`,
"schedule the next round") onto that agent's actual mechanism.

## Rules

- Edit `.agents/skills/<name>/SKILL.md` and its `references/`. Never edit a
  pointer by hand; `sync-skills.sh` overwrites it.
- Keep canonical files agent-neutral: no `ScheduleWakeup`, no `/loop`, no
  Codex- or Grok-specific tool names. Those belong in the per-agent notes.
- After any canonical change, run the sync so the `description` triggers stay
  identical across agents:

  ```bash
  bash .agents/scripts/sync-skills.sh
  ```

## Adding a skill

1. Create `.agents/skills/<name>/SKILL.md` with `name` and `description`
   frontmatter and an `# H1` title. Write the trigger as
   ``Use when the user runs `/<name>` or `$<name>`, ...`` so every agent's
   invocation syntax matches.
2. Put anything long in `.agents/skills/<name>/references/`.
3. Run `bash .agents/scripts/sync-skills.sh`.
4. Add `.codex/skills/<name>/agents/openai.yaml` if the skill should show up in
   the Codex skill picker.

## Current skills

| Skill | Purpose |
| --- | --- |
| `analyze` | Firebase/GA4 funnels, retention, growth experiments |
| `commit` | Branch checks, conventional commits, push, PR |
| `e2e-test` | Android emulator UX regression + Growtoki verification |
| `grow` | One metric-driven growth round for store ranking |
| `loop-review` | main → branch → review-self → PR → poll → verified merge |
| `release-update` | EAS build, store submit, Expo OTA rollout |
| `render-shorts` | Remotion quiz shorts, thumbnails, upload metadata |
| `review-pr` | PR review findings and review-comment handling |
| `review-self` | Self-review loop over the current work until stable |
| `seed-articles` | Generate and seed KO/EN/JA articles into Convex |
| `seed-quizzes` | Generate and seed KO/EN/JA quizzes into Convex |
| `update-version` | Version bump and Convex force-update records |
````

### 2.2 `.agents/scripts/sync-skills.sh` — **VERBATIM** (Martie)

```bash
#!/usr/bin/env bash
# Generates the per-agent skill pointers from the canonical .agents/skills SSOT.
# Re-runnable: it overwrites every pointer it owns.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

canonical_dir=".agents/skills"

claude_notes() {
  cat <<'EOF'
## Claude Code Notes

- Sibling skills written as `$name` in the canonical file are Claude Code
  skills; invoke them as `/name` or through the Skill tool.
- Use the Agent tool (`Explore`) for read-only fan-out when the canonical file
  asks for independent review lenses.
- For any interval or recurring step, use `ScheduleWakeup` or `/loop`. Never
  emulate it with `sleep`, `while true`, or a detached background process.
EOF
}

codex_notes() {
  cat <<'EOF'
## Codex Notes

- Sibling skills written as `$name` are Codex skills; invoke them directly.
- This skill's Codex interface metadata lives in `agents/openai.yaml`.
- For any interval or recurring step, use a Codex automation. Never emulate it
  with `sleep`, `while true`, or a detached background process.
EOF
}

grok_notes() {
  cat <<'EOF'
## Grok Notes

- Sibling skills written as `$name` are Grok skills; invoke them as `/name` or
  `/skills <name>`.
- Grok has no built-in scheduler. For any interval or recurring step, finish the
  current round and report that automatic re-entry could not be scheduled.
  Never emulate it with `sleep`, `while true`, or a detached background process.
EOF
}

write_pointer() {
  local agent_dir="$1" agent_label="$2" notes_fn="$3" name="$4" title="$5" description="$6"
  local out="$agent_dir/skills/$name/SKILL.md"
  mkdir -p "$(dirname "$out")"
  {
    printf -- '---\n'
    printf -- 'name: %s\n' "$name"
    printf -- 'description: %s\n' "$description"
    printf -- '---\n\n'
    printf -- '# %s (%s)\n\n' "$title" "$agent_label"
    printf -- 'Canonical definition: `%s/%s/SKILL.md`.\n\n' "$canonical_dir" "$name"
    printf -- 'Read that file — and every reference it points to — and follow it as\n'
    printf -- 'written. It is agent-neutral, so no section of it is written for another\n'
    printf -- 'agent. Relative paths inside it resolve under\n'
    printf -- '`%s/%s/`.\n\n' "$canonical_dir" "$name"
    "$notes_fn"
  } > "$out"
}

for dir in "$canonical_dir"/*/; do
  name="$(basename "$dir")"
  skill="${dir%/}/SKILL.md"
  description="$(awk 'NR>1 && /^description: /{sub(/^description: /,""); print; exit}' "$skill")"
  title="$(awk '/^# /{sub(/^# /,""); print; exit}' "$skill")"
  [ -n "$description" ] || { echo "missing description: $skill" >&2; exit 1; }
  [ -n "$title" ] || { echo "missing title: $skill" >&2; exit 1; }
  case "$description" in
    '>'*|'|'*)
      echo "multi-line description is not supported: $skill" >&2; exit 1 ;;
  esac

  write_pointer .claude "Claude Code" claude_notes "$name" "$title" "$description"
  write_pointer .codex  "Codex"       codex_notes  "$name" "$title" "$description"
  write_pointer .grok   "Grok"        grok_notes   "$name" "$title" "$description"
  echo "generated: $name"
done

# Prune pointers whose canonical skill is gone, so no agent advertises a skill
# that resolves to a missing file. Only the generated SKILL.md is removed;
# anything else in the directory is reported and left alone.
for agent_dir in .claude .codex .grok; do
  [ -d "$agent_dir/skills" ] || continue
  for pointer in "$agent_dir"/skills/*/; do
    name="$(basename "$pointer")"
    [ -d "$canonical_dir/$name" ] && continue
    rm -f "${pointer%/}/SKILL.md"
    rmdir "${pointer%/}" 2>/dev/null ||
      echo "pruned pointer, kept remaining files: ${pointer%/}" >&2
    echo "pruned: $agent_dir/$name"
  done
done
```

**Mechanics worth internalizing:**

- `description` extraction is `awk 'NR>1 && /^description: /'` — **`NR>1`** skips
  line 1 (the opening `---`), and it takes the **first** match then `exit`s.
- `title` extraction is the first `# ` H1 line in the canonical file.
- **Hard constraint:** the canonical `description:` MUST be a *single line*.
  A YAML block scalar (`description: >` or `description: |`) makes the script
  `exit 1` with `multi-line description is not supported`. FightingHows'
  skills violate this (they use `description: >`), which is exactly why
  FightingHows has no sync script. **BooKoo must write single-line descriptions.**
- Pointers are **overwritten every run** — never hand-edit them.
- Prune only removes the generated `SKILL.md` and then tries `rmdir`; if other
  files remain (e.g. `.codex/skills/<name>/agents/openai.yaml`) it warns and
  leaves them. So deleting a skill requires manually removing the leftover
  `openai.yaml` dir.
- The script does **not** generate `.codex/skills/<name>/agents/openai.yaml` —
  that file is hand-authored per skill (see §2.4).

### 2.3 Pointer file format — **VERBATIM output** (all three agents, `commit` skill)

`.claude/skills/commit/SKILL.md`:

```markdown
---
name: commit
description: Commit Martie repository changes safely. Use when the user runs `/commit` or `$commit`, asks to commit, push, or open a PR. Handles branch checks, conventional commit messages, validation, staging, push, and optional PR creation.
---

# Commit (Claude Code)

Canonical definition: `.agents/skills/commit/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/commit/`.

## Claude Code Notes

- Sibling skills written as `$name` in the canonical file are Claude Code
  skills; invoke them as `/name` or through the Skill tool.
- Use the Agent tool (`Explore`) for read-only fan-out when the canonical file
  asks for independent review lenses.
- For any interval or recurring step, use `ScheduleWakeup` or `/loop`. Never
  emulate it with `sleep`, `while true`, or a detached background process.
```

`.codex/skills/commit/SKILL.md` — identical except the H1 is
`# Commit (Codex)` and the notes block is:

```markdown
## Codex Notes

- Sibling skills written as `$name` are Codex skills; invoke them directly.
- This skill's Codex interface metadata lives in `agents/openai.yaml`.
- For any interval or recurring step, use a Codex automation. Never emulate it
  with `sleep`, `while true`, or a detached background process.
```

`.grok/skills/commit/SKILL.md` — H1 `# Commit (Grok)`, notes:

```markdown
## Grok Notes

- Sibling skills written as `$name` are Grok skills; invoke them as `/name` or
  `/skills <name>`.
- Grok has no built-in scheduler. For any interval or recurring step, finish the
  current round and report that automatic re-entry could not be scheduled.
  Never emulate it with `sleep`, `while true`, or a detached background process.
```

Note the trailing blank line differences: `printf` adds `\n\n` after the
relative-path sentence, then the heredoc ends with a newline. Claude/Codex
pointers end with a trailing newline; Grok's ends with the last bullet line.

### 2.4 `.codex/skills/<name>/agents/openai.yaml` — hand-authored, 4 lines

Exact examples (note: quoting style is inconsistent in Martie — `"` for most,
`'` for `review-self`; either parses):

```yaml
interface:
  display_name: "Commit"
  short_description: "Commit, push, and open PRs safely"
  default_prompt: "Use $commit to commit the current changes with conventional commit checks."
```

```yaml
interface:
  display_name: 'Review Self'
  short_description: 'Review and stabilize current Martie changes'
  default_prompt: 'Use $review-self to review and improve the current Martie work until stable.'
```

```yaml
interface:
  display_name: "Loop Review"
  short_description: "Run the Martie change-to-merge review loop"
  default_prompt: "Use $loop-review to take the current Martie change from main through review-self, PR, review polling, and a verified merge."
```

```yaml
interface:
  display_name: "Analyze"
  short_description: "Analyze Martie Firebase growth metrics"
  default_prompt: "Use $analyze to analyze the latest Martie Firebase/GA4 metrics and recommend the next retention experiments."
```

### 2.5 Canonical skill authoring conventions

Every canonical `.agents/skills/<name>/SKILL.md`:

1. Frontmatter with **exactly** `name:` and `description:` (single line).
2. `description` starts with a sentence of *what*, then the trigger sentence:
   ``Use when the user runs `/<name>` or `$<name>`, asks to …``. The dual
   `/name` + `$name` phrasing is what makes one description work for Claude
   (slash) and Codex/Grok (dollar).
3. An `# H1` title (used verbatim by the sync script).
4. Agent-neutral body. Cross-skill references are written `$other-skill`
   (never `/other-skill`) — the per-agent Notes section maps `$` onto the
   agent's real invocation.
5. Long procedures go in `references/workflow.md` and are linked as
   ``Read `references/workflow.md` …`` (relative to the canonical dir).

---

## 3. `AGENTS.md` and `CLAUDE.md` (Martie, both files in full)

### 3.1 `AGENTS.md` — **VERBATIM** (1574 bytes)

```markdown
# Commit Messages

Always write commit messages in Angular Conventional Commits format.

- Format: `<type>(<scope>): <subject>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
- Subject: imperative, lowercase, no period, ~50 chars max
- Use scope when helpful, e.g. `auth`, `api`, `ui`

## Branch Names

- For every new branch, use a task-intent prefix: `feat/`, `bugfix/`,
  `docs/`, `refactor/`, `test/`, or `chore/`.
- Never create branches with tool or vendor prefixes such as `codex/`.
- Use a concise kebab-case description after the prefix.

## List & Pagination Rules

- Any list backed by user-generated, server-side, or otherwise unbounded data must use `FlashList` from `@shopify/flash-list`.
- Do not render unbounded data with `ScrollView + array.map()` or fetch the full collection with `useQuery`/Convex `.collect()` for screen lists.
- Pair `FlashList` with Convex pagination: `paginationOptsValidator` on the query, `usePaginatedQuery` on the client, and `onEndReached` for loading more.
- `ScrollView` is acceptable only for static/short-form content, fixed-size controls, forms, detail pages, or deliberately capped preview sections such as "top 5".
- If a query can grow over time, add the right index for the list sort/filter before adding pagination.

## Agent Skills

Skills are defined once in `.agents/skills/<name>/SKILL.md` and mirrored to
`.claude/skills/`, `.codex/skills/`, and `.grok/skills/` as thin pointers.
Edit the canonical file only, then run `bash .agents/scripts/sync-skills.sh`.
See `.agents/README.md`.
```

### 3.2 `CLAUDE.md` — **VERBATIM** (3449 bytes)

````markdown
# Martie - Smart Trivia Quiz App

## Project Overview
React Native (Expo) + Convex backend trivia quiz app supporting 3 languages (ko, en, ja).

## Tech Stack
- **Frontend**: React Native, Expo Router, Emotion Native, cpk-ui
- **Backend**: Convex (serverless DB + functions)
- **Auth**: Convex Auth with Resend OTP
- **State**: Zustand, MMKV (local storage)
- **Languages**: TypeScript throughout

## Key Architecture
- `convex/schema/` — All table definitions (split by file)
- `convex/{domain}/mutations.ts` + `queries.ts` — Business logic per domain
- `app/` — Expo Router file-based routing
- `app/_Tabs/` — Tab-specific responsive components (Mobile/Tablet)
- `src/uis/` — Reusable UI components
- `assets/langs/*.json` — i18n strings (ko, en, ja + 6 more)
- `scripts/_seeds/` — Quiz seed data

## Conventions
- Admin emails in `src/utils/constants.ts` (ADMIN_USERS array)
- Quiz text stored separately in `quizLanguages` table (key-based)
- Categories use UPPER_SNAKE_CASE names, localized via `categoriesMap.ts`

## Agent Skills

Skills are defined once in `.agents/skills/<name>/SKILL.md` and mirrored to
`.claude/skills/`, `.codex/skills/`, and `.grok/skills/` as thin pointers.
Edit the canonical file only, then run `bash .agents/scripts/sync-skills.sh`.
See `.agents/README.md`.

## List & Pagination Rules

- Any list backed by user-generated, server-side, or otherwise unbounded data must use `FlashList` from `@shopify/flash-list`.
- Do not render unbounded data with `ScrollView + array.map()` or fetch the full collection with `useQuery`/Convex `.collect()` for screen lists.
- Pair `FlashList` with Convex pagination (`paginationOptsValidator` on the query, `usePaginatedQuery` on the client) and load more via `onEndReached`.
- `ScrollView` is only acceptable for static/short-form content, fixed-size controls, forms, detail pages, or deliberately capped preview sections such as "top 5".
- If a query can grow over time, add the right index for the list sort/filter before adding pagination.

## TypeScript Rules

- **`any` 사용 절대 금지.** 완전히 불가능한 경우가 아니면 `any` 대신 구체적 타입, `unknown`, 제네릭, 타입 가드를 사용할 것.
- Convex Id 타입은 `Id<'tableName'>` 사용 (import from `convex/_generated/dataModel`)
- Expo Router 경로는 `as any` 없이 string literal 사용 — typed routes가 에러를 내면 라우트 파일이 실제로 존재하는지 확인할 것
- i18n 동적 키가 필요하면 조건 분기(`if/switch`)로 처리, `t(dynamicKey as any)` 금지

---

## Coding Principles (Karpathy-inspired)

### 1. Think Before Coding
- State uncertainties explicitly before writing code
- When a request is ambiguous, present interpretations and ask — don't guess
- Document assumptions that aren't obvious from context

### 2. Simplicity First
- Write the minimum code that solves the stated problem
- No speculative features, unnecessary abstractions, or "just in case" error handling
- Three similar lines > one premature abstraction

### 3. Surgical Changes
- Only modify what's necessary for the task
- Match existing code style — don't "improve" surrounding code
- Don't add docstrings, comments, or type annotations to unchanged code

### 4. Goal-Driven Execution
- Transform tasks into verifiable success criteria
- "Fix the bug" → write a test reproducing it, then make it pass
- Always verify: `npx tsc --noEmit` for type safety
````

### 3.3 The four hard rules, isolated (these are the ones BooKoo must keep)

1. **FlashList + Convex pagination for unbounded lists.** Verbatim rule block
   appears **twice** (AGENTS.md and CLAUDE.md) — deliberate duplication so
   Codex/Grok (AGENTS.md readers) and Claude (CLAUDE.md reader) both see it.
   Concretely: `@shopify/flash-list` `FlashList` on the client,
   `paginationOptsValidator` on the Convex query, `usePaginatedQuery` +
   `onEndReached`. Banned: `ScrollView + array.map()`, `useQuery` of a whole
   collection, uncapped `.collect()`. Index must exist **before** pagination.
2. **No `any`.** "`any` 사용 절대 금지" — use concrete types, `unknown`,
   generics, or type guards. Convex ids are `Id<'tableName'>` from
   `convex/_generated/dataModel`.
3. **Typed expo-router routes without `as any`.** If typed routes error, the
   fix is to create the missing route file, never to cast.
4. **i18n dynamic-key ban.** `t(dynamicKey as any)` is forbidden; branch with
   `if`/`switch` to reach a literal key.
5. Plus the **Karpathy-inspired coding principles** block (Think Before Coding /
   Simplicity First / Surgical Changes / Goal-Driven Execution), which ends with
   the hard verification instruction `npx tsc --noEmit`.

FightingHows restates rules 1–3 in Korean plus adds:
- soft delete via `deletedAt` (hard delete only for pure join tables + orphan blobs);
- every Convex function's first line calls a `convex/lib/permissions.ts` helper;
- errors thrown as `ConvexError({code, message})`, mapped client-side by
  `src/utils/error.ts`;
- `kstyled` `styled`/`css`, numbers in css templates must be **unit strings**
  (`${bottom + 'px'}`), `font-family` without quotes;
- text via `Typography.*` from cpk-ui, RN `Text` banned;
- colors only from the theme token file (`src/theme.ts`), no hardcoding.

---

## 4. Cursor support — **does not exist yet; here is the design**

### 4.1 Verification

```
find <repo> -maxdepth 3 \( -name ".cursor*" -o -name "*.mdc" \) -not -path "*/node_modules/*"
git -C <repo> ls-files | grep -iE "cursor|\.mdc$"
```

Run against `/Users/hyo/Github/hyodotdev/Martie`,
`/Users/hyo/Github/hyodotdev/FightingHows`,
`/Users/hyo/Github/crossplatformkorea/cpk-ui` → **zero hits in all three.**
No `.cursor/`, no `.cursor/rules/`, no `.cursorrules`, no `*.mdc`.

### 4.2 What Cursor reads

- `.cursor/rules/*.mdc` — project rules, **flat files** (name = rule name), MDC
  = markdown + YAML frontmatter. Frontmatter keys: `description` (string),
  `globs` (comma-separated glob list, may be empty), `alwaysApply` (bool).
  Four modes: `alwaysApply: true` (always in context); `globs: <pattern>`
  (auto-attached when a matching file is touched); `description` only with
  `alwaysApply: false` (**agent-requested** — the model picks it by
  description, which is exactly the skill-trigger semantic we want);
  neither (manual, invoked as `@rule-name`).
- `@file` references inside a rule body pull additional files into context —
  this is what lets a Cursor pointer actually *include* the canonical SKILL.md.
- Cursor also reads a root `AGENTS.md` natively in recent versions, so BooKoo's
  `AGENTS.md` already covers Cursor for the always-on rules. `.cursor/rules/`
  is only needed for the **skills**.
- `.cursorrules` (single root file) is the deprecated predecessor. **Do not use.**

### 4.3 Designed `.cursor/rules/<name>.mdc` pointer format

Two nested-directory caveats vs. the other three agents: Cursor rules are flat
`*.mdc` files (no per-skill directory), and there is no `name:` frontmatter key
(the filename is the name).

```markdown
---
description: Commit BooKoo repository changes safely. Use when the user runs `/commit` or `$commit`, asks to commit, push, or open a PR. Handles branch checks, conventional commit messages, validation, staging, push, and optional PR creation.
globs:
alwaysApply: false
---

# Commit (Cursor)

Canonical definition: `.agents/skills/commit/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/commit/`.

@.agents/skills/commit/SKILL.md

## Cursor Notes

- Sibling skills written as `$name` are sibling rules in `.cursor/rules/`;
  pull one in with `@<name>` or ask for it by name.
- This rule is agent-requested (`alwaysApply: false`), so restate the goal
  when you invoke it — it is not automatically in context.
- Cursor has no built-in scheduler. For any interval or recurring step, finish
  the current round and report that automatic re-entry could not be scheduled.
  Never emulate it with `sleep`, `while true`, or a detached background process.
```

### 4.4 `sync-skills.sh` extension for Cursor (BooKoo version)

Add a `cursor_notes` function, a `write_cursor_pointer` function (different
frontmatter shape + flat path + `@file` include), a call in the main loop, and a
separate prune loop (flat files, not directories). Full BooKoo script in §9.3.

Key deltas from the Martie script:

```bash
cursor_notes() {
  cat <<'EOF'
## Cursor Notes

- Sibling skills written as `$name` are sibling rules in `.cursor/rules/`;
  pull one in with `@<name>` or ask for it by name.
- This rule is agent-requested (`alwaysApply: false`), so restate the goal
  when you invoke it — it is not automatically in context.
- Cursor has no built-in scheduler. For any interval or recurring step, finish
  the current round and report that automatic re-entry could not be scheduled.
  Never emulate it with `sleep`, `while true`, or a detached background process.
EOF
}

write_cursor_pointer() {
  local name="$1" title="$2" description="$3"
  local out=".cursor/rules/$name.mdc"
  mkdir -p "$(dirname "$out")"
  {
    printf -- '---\n'
    printf -- 'description: %s\n' "$description"
    printf -- 'globs:\n'
    printf -- 'alwaysApply: false\n'
    printf -- '---\n\n'
    printf -- '# %s (Cursor)\n\n' "$title"
    printf -- 'Canonical definition: `%s/%s/SKILL.md`.\n\n' "$canonical_dir" "$name"
    printf -- 'Read that file — and every reference it points to — and follow it as\n'
    printf -- 'written. It is agent-neutral, so no section of it is written for another\n'
    printf -- 'agent. Relative paths inside it resolve under\n'
    printf -- '`%s/%s/`.\n\n' "$canonical_dir" "$name"
    printf -- '@%s/%s/SKILL.md\n\n' "$canonical_dir" "$name"
    cursor_notes
  } > "$out"
}

# …in the main loop, after the three write_pointer calls:
  write_cursor_pointer "$name" "$title" "$description"

# …separate prune loop (flat .mdc files):
if [ -d .cursor/rules ]; then
  for pointer in .cursor/rules/*.mdc; do
    [ -e "$pointer" ] || continue
    name="$(basename "$pointer" .mdc)"
    [ -d "$canonical_dir/$name" ] && continue
    rm -f "$pointer"
    echo "pruned: .cursor/rules/$name.mdc"
  done
fi
```

### 4.5 Optional: an always-on Cursor rule mirroring the hard rules

Because Cursor's AGENTS.md support is version-dependent, belt-and-braces:
`.cursor/rules/00-project.mdc` with `alwaysApply: true` that just `@`-includes
the two root docs. Hand-authored (not generated), so name it with a `00-`
prefix so it sorts before generated skill rules and is obviously not a pointer:

```markdown
---
description: BooKoo project-wide hard rules (lists/pagination, no any, typed routes, i18n keys).
globs:
alwaysApply: true
---

# BooKoo Project Rules

@AGENTS.md
@CLAUDE.md
```

`sync-skills.sh` must **not** prune it — the prune loop above would delete it,
since `.agents/skills/00-project/` does not exist. Guard it:

```bash
    case "$name" in 00-*) continue ;; esac
```

(inserted right after `name="$(basename "$pointer" .mdc)"`). This guard is in
the BooKoo script in §9.3.

---

## 5. Agent config directories, file by file

### 5.1 `.claude/settings.json` — **VERBATIM** (Martie AND FightingHows, identical)

```json
{
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
```

### 5.2 `.claude/settings.local.json` (gitignored, machine-local)

Structure only — 173 lines, 21482 bytes in Martie:

```json
{
  "permissions": {
    "allow":  [ /* 158 entries, e.g. "Bash(git commit:*)", "Bash(bun lint:*)",
                  "Bash(bunx tsc:*)", "Bash(gh pr create:*)", "WebFetch(domain:github.com)",
                  "Bash(eas update:list --limit 10 --json --non-interactive)" */ ],
    "deny":   [],
    "additionalDirectories": [ "/absolute/path", ... ]   /* 6 entries in Martie */
  }
}
```

Ignored by `.gitignore` line `.claude/**local.json`. **Do not commit.** Start
BooKoo's empty; it accretes as you approve tools.

### 5.3 `.codex/` and `.grok/`

Martie: only `skills/` (all generated pointers) + hand-written
`agents/openai.yaml` per Codex skill. No other files.

FightingHows adds `.grok/README.md` (verbatim, useful precedent for explaining
what a vendor dir may and may not contain):

```markdown
# Grok project extras

Shared rules live in `AGENTS.md` and `CLAUDE.md`. Shared skill bodies live in
`.agents/skills/`. This folder is Grok-only.

| Path | Purpose |
|------|---------|
| `agents/` | Extra `spawn_subagent` types (`convex`, `mobile-ui`) |
| `workflows/` | Optional Rhai workflows (add when a pipeline is repeatable) |

Do not put skill copies here. Grok already loads `.agents/skills/` and
`.claude/commands/`. A third copy would collide by name.
```

### 5.4 Per-directory `AGENTS.md` (FightingHows) — **VERBATIM**

`convex/AGENTS.md`:

```markdown
# Convex

이 디렉터리에서 작업할 때.

- 함수 첫 줄: `convex/lib/permissions.ts` 헬퍼.
- 에러: `ConvexError({code, message})`.
- 목록: `paginationOptsValidator` + `.paginate()` + 인덱스. 상한 없는
  `.collect()` 금지. 작은 카탈로그만 `.take()`.
- 삭제는 `deletedAt`. 하드 삭제는 조인 테이블과 고아 blob 만.
- 스키마는 `schema/*.ts` → `schema.ts` 조립.
- `convex/_generated/**` 직접 수정 금지. 배포 확인은 `bunx convex dev --once`.
```

`app/AGENTS.md`:

```markdown
# Routes

- expo-router typed routes. `as any` 금지. 타입 에러면 라우트 파일이 있는지
  먼저 확인.
- 인증 게이트는 `app/_layout.tsx` 의 `AuthGate` + `src/hooks/useSession.ts`.
- 새 화면을 추가하면 stage 허용 목록을 같이 본다. `terms` / `privacy` 는
  로그인 전에도 열린다.
- 필수 프로필(성별·생일·출생연도·전화)이 비면 `/complete-profile`.
```

`src/AGENTS.md`:

```markdown
# UI

- 텍스트: `Typography.*`. RN `Text` 금지.
- 스타일: `kstyled` 의 `styled` / `css`. 색은 `src/theme.ts`.
- 무한 목록: `FlashList` + `usePaginatedQuery` + `onEndReached`.
- 사용자 문자열은 한국어로 컴포넌트에 직접. i18n 없음.
- `src/uis/LogoMark.tsx` 직접 수정 금지 → `scripts/logo.ts` + `bun run assets:logo`.
```

### 5.5 Domain subagents (FightingHows `.grok/agents/*.md`) — **VERBATIM**

Frontmatter keys used: `name`, `description` (block scalar), `prompt_mode: full`,
`permission_mode: default`, `agents_md: true`.

`.grok/agents/convex.md`:

```markdown
---
name: convex
description: >
  FightingHows Convex backend specialist. Use for schema, queries, mutations,
  actions, permissions, and serializers under convex/. Read-write; no UI edits.
prompt_mode: full
permission_mode: default
agents_md: true
---

You implement or review Convex work in this repo only.

Rules:
- First line of every function calls a helper from `convex/lib/permissions.ts`.
- Throw `ConvexError({code, message})`. Client maps it via `src/utils/error.ts`.
- Unbounded lists use `paginationOptsValidator` + `.paginate()` and a matching
  index. No uncapped `.collect()`. Tiny catalogs may `.take()`.
- Soft-delete with `deletedAt`. Hard-delete only join tables and orphan blobs.
- Schema lives in `convex/schema/*.ts` and is assembled in `convex/schema.ts`.
- Never edit `convex/_generated/**`.
- Ids are `Id<'tableName'>`. No `any`.
- After schema or function signature changes, run `bunx convex dev --once`.

Stay inside `convex/` unless the caller asked to touch a client caller.
Return file paths and what to verify.
```

`.grok/agents/mobile-ui.md`:

```markdown
---
name: mobile-ui
description: >
  FightingHows Expo Router / React Native UI specialist. Use for screens under
  app/, feature UI under src/features/, and shared components under src/uis/.
prompt_mode: full
permission_mode: default
agents_md: true
---

You implement or review mobile UI in this repo only.

Rules:
- Korean copy is written in the component. No i18n library.
- Text is `Typography.*` from cpk-ui. Do not use RN `Text`.
- Style with `kstyled` `styled` / `css`. Numbers in css templates are unit
  strings. Colors come from `src/theme.ts`.
- Unbounded lists are `FlashList` + `usePaginatedQuery` + `onEndReached`.
- expo-router paths are literals. No `as any`. If types fail, add the route
  file first.
- New screens must fit `useSession` stages and `AuthGate` in `app/_layout.tsx`.
  Missing gender / birthday / birthyear / phone is `/complete-profile`.
- Do not edit `src/uis/LogoMark.tsx`. Change `scripts/logo.ts` and run
  `bun run assets:logo`.
- After a screen change, the caller should run `/e2e-test`.

Stay inside `app/`, `src/features/`, `src/uis/`, `src/hooks/`, `src/theme.ts`
unless the caller asked otherwise.
```

For **Claude Code**, the same body works as `.claude/agents/<name>.md` with
frontmatter `name`, `description`, `tools` (optional), `model` (optional).

---

## 6. Repo tooling, file by file

### 6.1 `.husky/pre-commit` — **VERBATIM** (Martie)

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

bun lint:all
bun tsc --noEmit
bun test
```

### 6.2 `.husky/commit-msg` — **VERBATIM** (Martie)

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx commitlint --edit $1
```

Both are `chmod +x` (mode 755). `.husky/_/` is generated by `husky install`
and is **not** committed in Martie. FightingHows has **no** `.husky/` at all.

### 6.3 `commitlint.config.cjs` — **VERBATIM** (Martie)

```js
const {maxLineLength} = require('@commitlint/ensure');

const bodyMaxLineLength = 500;

const validateBodyMaxLengthIgnoringDeps = (parsedCommit) => {
  const {type, scope, body} = parsedCommit;

  const isDepsCommit =
    type === 'chore' && (scope === 'deps' || scope === 'deps-dev');

  return [
    isDepsCommit || !body || maxLineLength(body, bodyMaxLineLength),
    `body's lines must not be longer than ${bodyMaxLineLength}`,
  ];
};

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: ['commitlint-plugin-function-rules'],
  rules: {
    'body-max-line-length': [0],
    'function-rules/body-max-line-length': [
      2,
      'always',
      validateBodyMaxLengthIgnoringDeps,
    ],
  },
};
```

Deps: `@commitlint/cli@^21.2.1`, `@commitlint/config-conventional@^21.2.0`,
`commitlint-plugin-function-rules@^5.0.1`.
cpk-ui ships the same file but inlines `maxLineLength` itself instead of
importing from `@commitlint/ensure`.

### 6.4 `.github/workflows/ci.yml` — **VERBATIM** (Martie)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened]


jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.14.0
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.13

      - name: Install modules
        run: bun install --immutable

      - name: Check linting
        run: bun lint:all

      - name: Build typescript
        run: bun tsc

      - name: Build shorts typescript
        run: |
          cd programs/shorts
          bun install --immutable
          bun run typecheck

      - name: Remove dist
        run: rm -rf ./dist

      - name: Test
        run: bun run test --coverage --silent

      # - name: Upload coverage to Codecov
      #   uses: codecov/codecov-action@v1
      #   with:
      #     token: ${{ secrets.CODECOV_TOKEN }}
      #     directory: ./coverage/
      #     flags: unittests
      #     name: codecov-umbrella
      #     fail_ci_if_error: false
      #     path_to_write_report: ./coverage/codecov_report.gz
```

(BooKoo drops the "Build shorts typescript" step — Martie-only `programs/shorts`.)

### 6.5 `.github/workflows/deploy.yml` — **VERBATIM** (Martie)

```yaml
name: Deploy Web on Release
on:
  workflow_dispatch:
  release:
    types: [created]

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.14.0
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.13
      - uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Install modules
        run: bun install --immutable

      - name: Build web
        run: bun build:web
        env:
          ROOT_URL: ${{ secrets.ROOT_URL }}
          expoProjectId: ${{ secrets.expoProjectId }}
```

Also present: `.github/copilot-instructions.md` (~7 KB, the CPK React Native
style guide — Emotion-era, references `useCPK()`/`isTablet`, `@emotion/native`
`css`, Zustand + immer, React Query). **Mostly stale for BooKoo** (BooKoo uses
kstyled, not emotion). The parts still true: `isTablet` from `useCPK()`,
directory layout (`app/`, `src/{apis,hooks,modals,providers,stores,uis,utils}`,
`assets/{fonts,icons,langs,lotties}`), PascalCase component files, named
exports for utils, conventional commit types. Rewrite for kstyled before use.

### 6.6 `.vscode/settings.json` — **VERBATIM** (Martie)

```json
{
  "eslint.enable": true,
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "editor.codeActionsOnSave": {
    "source.fixAll": "explicit"
  },
  "claudeCode.allowDangerouslySkipPermissions": true,
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "javascript.preferences.importModuleSpecifier": "relative",
  "typescript.preferences.importModuleSpecifier": "relative",
  "prettier.configPath": ".prettierrc.js",
  "files.exclude": {
    "**/.git": true,
    "**/.svn": true,
    "**/.hg": true,
    "**/CVS": true,
    "**/.DS_Store": true,
    "**/Thumbs.db": true,
    "**/.classpath": true,
    "**/.project": true,
    "**/.settings": true,
    "**/.factorypath": true
  },
  "cSpell.words": [
    "Admob", "androidpublisher", "cpk", "crossplatformkorea", "hyochan",
    "IAPKIT", "IRONSOURCE", "Martie", "MMKV", "Nanum", "notifee", "Pressable",
    "Pretendard", "privacyandpolicy", "Proguard", "Skus", "Subviews",
    "termsofservice", "uuidv", "wordmark"
  ]
}
```

### 6.7 `.vscode/extensions.json` — **VERBATIM** (note the trailing comma; VS Code's JSONC tolerates it)

```jsonc
{
  "recommendations": [
    "formulahendry.auto-rename-tag",
    "aaron-bond.better-comments",
    "vscode-icons-team.vscode-icons",
    "streetsidesoftware.code-spell-checker",
    "styled-components.vscode-styled-components",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
  ]
}
```

### 6.8 `.vscode/launch.json` — **VERBATIM**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to packager",
      "cwd": "${workspaceFolder}",
      "type": "reactnative",
      "request": "attach"
    }
  ]
}
```

### 6.9 `.vscode/mcp.json` — **VERBATIM** (this is how the Convex MCP is wired)

```json
{
  "servers": {
    "convex-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "convex@latest", "mcp", "start"]
    }
  }
}
```

### 6.10 `.vscode/cpk.code-snippets` — **VERBATIM** (emotion-era; rewrite for kstyled)

```json
{
  "CPK React Native Component": {
    "prefix": "cpk",
    "body": [
      "/**",
      " * @name $1",
      " *",
      " * See the style guide: https://github.com/hyochan/style-guide/blob/main/docs/REACT.md",
      " */",
      "import styled from '@emotion/native';",
      "import {View} from 'react-native';",
      "",
      "type Props = {}",
      "",
      "export default function $1({}: Props): JSX.Element {",
      "",
      "  return (",
      "    <Container>",
      "      <View></View>",
      "    </Container>",
      "  )",
      "}",
      "const Container = styled.View`",
      "  flex: 1;",
      "`"
    ],
    "description": "React Native Component"
  }
}
```

### 6.11 `.prettierrc.js` — **VERBATIM** (identical in Martie and FightingHows)

```js
// prettier.config.js or .prettierrc.js
module.exports = {
  trailingComma: 'all',
  arrowParens: 'always',
  singleQuote: true,
  jsxSingleQuote: false,
  bracketSpacing: false,
};
```

(cpk-ui uses `.prettierrc.cjs` with the same body.)

### 6.12 ESLint

**Martie `.eslintrc.js`** — extends `['expo', 'prettier', 'plugin:i18n-json/recommended']`,
plugin `prettier`, plus three `i18n-json` rules keyed off `assets/langs/ko.json`:

```js
const path = require('path');

module.exports = {
  root: true,
  extends: ['expo', 'prettier', 'plugin:i18n-json/recommended'],
  plugins: ['prettier'],
  rules: {
    'eslint-comments/no-unlimited-disable': 0,
    'eslint-comments/no-unused-disable': 0,
    'i18n-json/identical-keys': [
      2,
      {
        filePath: path.resolve('./assets/langs/ko.json'),
      },
    ],
    'i18n-json/sorted-keys': [
      2,
      {
        order: 'asc',
        indentSpaces: 2,
      },
    ],
    'i18n-json/valid-message-syntax': [
      2,
      {
        syntax: path.resolve('./custom-syntax-validator.ts'),
      },
    ],
  },
  overrides: [ /* per-file React-Compiler rule disables, see below */ ],
};
```

Overrides (React Compiler false positives, exact rule names):
- `react-hooks/immutability: 'off'` for Reanimated shared-value files;
- `react-hooks/purity: 'off'` for `app/article-detail.tsx`;
- `react-hooks/preserve-manual-memoization: 'off'` for `app/(tabs)/my.tsx`, `app/quiz.tsx`;
- `react-hooks/set-state-in-effect: 'off'` for a list of 13 files.

**Martie `.eslintignore`** — **VERBATIM**:

```
**/*.js
# **/*/__tests__/**/*
node_modules/
assets/langs/meta/

# types
*.d.ts
```

**FightingHows `.eslintrc.js`** — closer to BooKoo (no i18n-json, explicit
`no-explicit-any: error`, `ignorePatterns` instead of `.eslintignore`):

```js
module.exports = {
  root: true,
  extends: ['expo', 'prettier'],
  plugins: ['prettier'],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'ios/',
    'android/',
    'convex/_generated/',
    '.expo/',
  ],
  rules: {
    'eslint-comments/no-unlimited-disable': 0,
    'eslint-comments/no-unused-disable': 0,
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['warn', {allow: ['warn', 'error']}],
  },
  overrides: [
    {
      files: ['app/pending.tsx', 'app/post/*.tsx', 'src/features/shorts/ShortsPlayer.tsx'],
      rules: {'react-hooks/immutability': 'off', 'react-hooks/refs': 'off'},
    },
    {
      files: [ /* files that sync state to Convex/MMKV/expo-video */ ],
      rules: {'react-hooks/set-state-in-effect': 'off'},
    },
    {
      // Module augmentation for kstyled / cpk-ui — the empty bodies are the point.
      files: ['src/styled.d.ts'],
      rules: {'@typescript-eslint/no-empty-object-type': 'off'},
    },
  ],
};
```

> Note the comment in FightingHows: bracketed route dirs (`app/post/[id].tsx`)
> are glob character classes, so overrides must match the **directory**
> (`app/post/*.tsx`), not the bracketed filename.

**`custom-syntax-validator.ts`** (Martie, used by `i18n-json/valid-message-syntax`) — VERBATIM:

```ts
module.exports = (message, key) => {
  if (key.includes('-')) {
    throw new SyntaxError('Key must use underbar(-) instead of hyphen(-)!');
  }
};
```

(The message text is buggy — it says "underbar(-)" instead of "underbar(_)".
Fix when copying: `'Key must use underscore(_) instead of hyphen(-)!'`.)

### 6.13 `tsconfig.json`

**Martie** (kept for reference; the `typescript-styled-plugin` block is
emotion-era and unnecessary with kstyled):

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "jsx": "react-jsx",
    "lib": ["es2017", "dom"],
    "module": "es2015",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "noEmit": true,
    "noUnusedLocals": false,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "target": "es2020",
    "useUnknownInCatchVariables": true,
    "typeRoots": ["./node_modules/@types", "expo-router/ts-declarations", "./@types"],
    "types": ["react", "jest"],
    "plugins": [{ "name": "typescript-styled-plugin", "lint": { "validProperties": [
      "shadow-color","shadow-opacity","shadow-offset","shadow-radius","spread-radius",
      "padding-horizontal","padding-vertical","margin-vertical","margin-horizontal",
      "tint-color","aspect-ratio","elevation","blur-radius"] } }],
    "paths": {"@/*": ["./*"]}
  },
  "include": ["app/**/*.ts","app/**/*.tsx","src/**/*.ts","src/**/*.tsx",
              "**/*.test.tsx","**/*.spec.ts",".expo/types/**/*.ts",
              "expo-env.d.ts","@types/**/*.d.ts"],
  "exclude": ["node_modules", "scripts"],
  "jest": {"globals": {"ts-jest": {"skipBabel": true}}},
  "files": ["environment.d.ts", "src/styled.d.ts"]
}
```

**FightingHows** — **use this shape for BooKoo** (strict + unused checks on,
kstyled path aliases, convex generated excluded):

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "jsx": "react-jsx",
    "paths": {
      "~/*": ["./src/*"],
      "@convex/*": ["./convex/*"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts",
    "src/styled.d.ts"
  ],
  "exclude": ["node_modules", "dist", "android", "ios", "convex/_generated"]
}
```

### 6.14 `jest.config.ts` — **VERBATIM** (Martie)

```ts
import type {Config} from '@jest/types';

process.env.TZ = 'Asia/Seoul';

export default async (): Promise<Config.InitialOptions> => {
  return {
    // https://github.com/jefflau/jest-fetch-mock#to-setup-for-all-tests
    automock: false,
    resetMocks: false,
    preset: 'jest-expo',
    transform: {
      '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
    },
    transformIgnorePatterns: [
      // Transform ESM in selected node_modules (e.g., immer, zustand middleware)
      'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation|@unimodules/.*|unimodules|native-base|react-native-svg|cpk-ui|@cpk-ui|immer|zustand)',
    ],
    modulePaths: ['<rootDir>'],
    moduleDirectories: ['node_modules'],
    testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
    moduleFileExtensions: ['js', 'ts', 'tsx', 'svg', 'png', 'json'],
    modulePathIgnorePatterns: [
      '<rootDir>/build/',
      '<rootDir>/node_modules/',
      '<rootDir>/.history/',
    ],
    moduleNameMapper: {
      '\\.svg': '<rootDir>/__mocks__/svgMock.js',
      '.+\\.(css|style|less|sass|scss|png|jpg|ttf|woff|woff2)$': 'babel-jest',
      '^convex/react$': '<rootDir>/__mocks__/convex/react.ts',
      '^react-native-worklets$':
        '<rootDir>/__mocks__/react-native-worklets.js',
      '^react-native-reanimated$':
        '<rootDir>/__mocks__/react-native-reanimated.js',
    },
    setupFiles: [
      '<rootDir>/test/testSetup.ts',
      './node_modules/react-native-gesture-handler/jestSetup.js',
    ],
    cacheDirectory: '.jest/cache',
    setupFilesAfterEnv: [
      '@testing-library/jest-native/extend-expect',
      './test/testSetupAfterEnv.ts',
    ],
    haste: {
      defaultPlatform: 'ios',
      platforms: ['android', 'ios', 'native'],
    },
    coveragePathIgnorePatterns: ['/node_modules/'],
    // Ensure Jest exits cleanly even if some handles remain (e.g., timers)
    forceExit: true,
    // Avoid watchman dependency in CI/sandbox environments
    watchman: false,
  };
};
```

**Two latent bugs in Martie's mapper — fix in BooKoo:**
- `'\\.svg': '<rootDir>/__mocks__/svgMock.js'` — **`__mocks__/svgMock.js` does not
  exist** in the repo. Either create it (`module.exports = 'SvgMock';`) or drop
  the mapping.
- `'^convex/react$': '<rootDir>/__mocks__/convex/react.ts'` — the actual file is
  `__mocks__/convex/react.**tsx**`. Fix the extension or rename the file.
  (`test/testSetup.ts` separately does `jest.mock('convex/react', …)` inline,
  which is why nobody noticed.)

### 6.15 `.jest/` and `__mocks__/`

`.jest/` contains only `cache/` (jest `cacheDirectory: '.jest/cache'`). It is
**gitignored** (`.jest` is the last non-comment line before `/ios` in
`.gitignore`) and also listed in `.easignore`. Nothing to commit — create the
dir implicitly by running jest.

`__mocks__/` files, all **VERBATIM**:

`__mocks__/convex/react.tsx`:
```tsx
export class ConvexReactClient {
  constructor(
    public url: string,
    public options: {unsavedChangesWarning: boolean},
  ) {}
}
```

`__mocks__/convex/http.ts`:
```ts
import {httpRouter} from 'convex/server';

const http = httpRouter();

export default http;
```

`__mocks__/expo-asset.ts`:
```ts
export default {
  loadSingleFontAsync: jest.fn(),
};
```

`__mocks__/expo-localization.ts`:
```ts
export const getLocales = () => [
  {
    languageCode: 'en',
    languageTag: 'en-US',
    regionCode: 'US',
    scriptCode: 'Latn',
  },
];

export const locale = 'en';
export const timezone = 'America/Los_Angeles';
export const isRTL = false;
export const decimalSeparator = '.';
export const digitGroupingSeparator = ',';
```

`__mocks__/sentry-expo.ts`:
```ts
export const Native = {
  captureException: jest.fn(),
};
```

`__mocks__/react-native-worklets.js`:
```js
module.exports = {
  Worklets: {
    defaultContext: {
      createRunAsync: jest.fn(),
      createRunOnJS: jest.fn(),
    },
    createContext: jest.fn(),
    createRunOnJS: jest.fn(),
    createSharedValue: jest.fn(),
  },
  createSerializable: jest.fn(() => ({value: null})),
};
```

`__mocks__/react-native-reanimated.js` — 2559 bytes, the standard
reanimated-v4 manual mock (not reproduced; regenerate from the reanimated docs
or copy the file from Martie at
`/Users/hyo/Github/hyodotdev/Martie/__mocks__/react-native-reanimated.js`).

`test/testSetup.ts` (Martie, jest `setupFiles`) mocks in this order:
`jest-fetch-mock` on `global.fetch`/`fetchMock`, `global.__reanimatedWorkletInit`,
then `jest.mock(...)` for: `expo-router`, `@expo/react-native-action-sheet`,
`expo-font` (`useFonts: () => []`), `expo-audio`,
`@react-native-async-storage/async-storage` (via its bundled
`jest/async-storage-mock`), `react-native/Libraries/EventEmitter/NativeEventEmitter`,
`@react-native-firebase/analytics`, `react-native-google-mobile-ads`,
`@notifee/react-native`, `react-native-keyboard-controller` (via its own
`/jest` entry), `convex/react` (`ConvexProvider` passthrough +
`ConvexReactClient` mock), `expo-iap`. It also defines `global.Window` if absent.

`test/testSetupAfterEnv.ts` — **VERBATIM**:
```ts
import {cleanup} from '@testing-library/react-native';

// Cleanup after each case.
afterEach(cleanup);

process.on('unhandledRejection', (err) => {
  fail(err);
});
```

`test/testUtils.tsx` exports `createTestElement(child, mockContext?, themeType?)`
(wraps in `RootProvider` from `../src/providers`), `createTestProps(obj?)`,
`createMockNavigation()` (returns a full stub of react-navigation methods), and
`TestSafeAreaProvider({children})` (SafeAreaProvider with zeroed
`initialMetrics`). Copy this file for BooKoo — it is stack-agnostic.

`@types/jsx.d.ts` — global `JSX` namespace shim (needed because RN 0.86 /
React 19 removed the global `JSX` namespace and cpk-ui components are typed
`: JSX.Element`). **VERBATIM**:

```ts
import React from 'react';

declare global {
  namespace JSX {
    interface Element extends React.ReactElement<any, any> {}
    interface ElementClass extends React.Component<any> {
      render(): React.ReactNode;
    }
    interface ElementAttributesProperty {
      props: {};
    }
    interface ElementChildrenAttribute {
      children: {};
    }
    interface IntrinsicAttributes extends React.Attributes {}
    interface IntrinsicClassAttributes<T> extends React.ClassAttributes<T> {}
  }
}
```

### 6.16 `metro.config.js`

**Martie** (blocks the `programs/` sub-project from Metro's resolver):

```js
const {getDefaultConfig} = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('cjs', 'mjs');
const programsPath = path.resolve(__dirname, 'programs').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  ...(config.resolver.blockList || []),
  new RegExp(programsPath + '/.*'),
];

module.exports = config;
```

**FightingHows** — use this for BooKoo (nothing to block):

```js
const {getDefaultConfig} = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs', 'mjs');

module.exports = config;
```

### 6.17 `babel.config.js` — **VERBATIM** (Martie; FightingHows identical modulo comment)

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['babel-plugin-kstyled', {debug: false, strict: true}],
      // Reanimated v4 moved the Babel plugin to react-native-worklets
      'react-native-worklets/plugin',
    ],
  };
};
```

**`react-native-worklets/plugin` must stay LAST** (FightingHows spells this out
in a comment). `babel-plugin-kstyled@0.4.1` pairs with `kstyled@0.4.1` — keep
the versions locked together.

### 6.18 `app.config.ts` — structure and how env / STAGE / variants work

**Martie's STAGE mechanism (the interesting part) — VERBATIM head of file:**

```ts
import 'dotenv/config';

import type {ConfigContext, ExpoConfig} from '@expo/config';
import dotenv from 'dotenv';
import {expand} from 'dotenv-expand';
import path from 'path';

import {version} from './package.json';

// https://github.com/expo/expo/issues/23727#issuecomment-1651609858
if (process.env.STAGE) {
  expand(
    dotenv.config({
      path: path.join(
        __dirname,
        ['./.env', process.env.STAGE].filter(Boolean).join('.'),
      ),
      override: true,
    }),
  );
}
```

So: `STAGE=prod` → loads `./.env.prod` with `override: true` and
`dotenv-expand`. When `STAGE` is unset, only `dotenv/config` (→ `.env`) applies.
`version` is imported from `package.json` (single source of app version).

**Build-variant flags** are plain env vars read at config-evaluation time:

```ts
const isAmazonAppstoreBuild = process.env.AMAZON_APPSTORE === '1';
const isHorizonOsBuild = process.env.HORIZON_OS === '1';
const metaHorizonAppId = process.env.META_HORIZON_APP_ID ?? process.env.HORIZON_APP_ID;

if (isAmazonAppstoreBuild && isHorizonOsBuild) {
  throw new Error('AMAZON_APPSTORE=1 and HORIZON_OS=1 are mutually exclusive');
}
if (isHorizonOsBuild && !metaHorizonAppId) {
  throw new Error('META_HORIZON_APP_ID or HORIZON_APP_ID is required when building with HORIZON_OS=1');
}
```

**Conditional plugin mounting** uses spread of a typed array:

```ts
type ExpoPlugin = NonNullable<ExpoConfig['plugins']>[number];

const customAssetsPlugin: ExpoPlugin = ['expo-custom-assets', {assetsPaths: ['./assets/sounds']}];
// …
plugins: [
  ...,
  ...(isAmazonAppstoreBuild ? [] : [customAssetsPlugin]),
  ...
]
```

FightingHows does the same with `satisfies ExpoPlugin[]`:

```ts
...(kakaoAppKey
  ? ([['@react-native-seoul/kakao-login', {kakaoAppKey}]] satisfies ExpoPlugin[])
  : []),
```

…and carries a load-bearing comment: mounting a plugin with a *placeholder*
value bakes the placeholder into the native project at prebuild and silently
diverges from the JS env. **Gate the plugin on the same env var the UI gates on.**
This is directly relevant to BooKoo's Kakao/Naver/Google/Apple auth.

**Other structural pieces of Martie's config, exact keys:**

```ts
export default ({config}: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Martie', scheme: 'martie', slug: 'martie',
  platforms: ['ios','android','web'],
  version,                                  // from package.json
  orientation: 'default',
  icon: './assets/icon.png',
  plugins: [ /* ~20 entries, see file */ ],
  owner: 'crossplatformkorea',
  experiments: {typedRoutes: true},         // ← typed expo-router
  extra: {
    ROOT_URL: process.env.ROOT_URL,
    expoProjectId: process.env.expoProjectId,
    eas: {projectId: '89e8816c-1b59-4336-b3ea-110469262de7'},
  },
  updates: {
    fallbackToCacheTimeout: 0,
    requestHeaders: {'expo-channel-name': 'production'},
    url: 'https://u.expo.dev/89e8816c-1b59-4336-b3ea-110469262de7',
  },
  runtimeVersion: {policy: 'appVersion'},
  assetBundlePatterns: ['**/*'],
  userInterfaceStyle: 'automatic',          // ← dark/light
  ios: {
    bundleIdentifier: 'dev.hyo.martie', appleTeamId: 'PRDQGB267K',
    associatedDomains: ['applinks:hyo.dev'],
    supportsTablet: true,                   // ← tablet
    googleServicesFile: './GoogleService-Info.plist',
    infoPlist: {CFBundleAllowMixedLocalizations: true,
                CFBundleLocalizations: ['en','ko','ja'],
                ITSAppUsesNonExemptEncryption: false, /* + NSUserTracking… */},
    appStoreUrl: '…',
  },
  android: {
    userInterfaceStyle: 'automatic',
    googleServicesFile: './google-services.json',
    blockedPermissions: isHorizonOsBuild ? HORIZON_BLOCKED_ANDROID_PERMISSIONS : undefined,
    permissions: [...(isHorizonOsBuild ? HORIZON_ANDROID_PERMISSIONS : DEFAULT_ANDROID_PERMISSIONS)],
    package: 'dev.hyo.martie',
    adaptiveIcon: {foregroundImage: './assets/icon_round.png', backgroundColor: '#EFEFEF'},
    intentFilters: [{action: 'VIEW', autoVerify: true, data: [...], category: ['BROWSABLE','DEFAULT']}],
    playStoreUrl: '…',
  },
  locales: {ko: './assets/langs/meta/ko.json', en: './assets/langs/meta/en.json',
            ja: './assets/langs/meta/ja.json'},   // ← store-metadata localization
  description: '…',
  web: {bundler: 'metro', favicon: './assets/favicon.png'},
});
```

**BooKoo-relevant takeaways from app.config.ts:**
- `experiments: {typedRoutes: true}` is what makes the "no `as any` on routes" rule enforceable.
- `userInterfaceStyle: 'automatic'` at root **and** under `android` — needed for dark mode.
- `ios.supportsTablet: true` — needed for tablet layouts (FightingHows sets `false`; BooKoo needs `true`).
- `locales: {…}` maps **store/OS metadata** localization files (separate from
  in-app i18n JSON). Martie keeps them under `assets/langs/meta/*.json` and
  eslint-ignores that dir.
- `runtimeVersion: {policy: 'appVersion'}` + `updates.url` — OTA setup.
- FightingHows uses `extra.eas.projectId: process.env.EAS_PROJECT_ID` (env-driven)
  instead of a hardcoded id. **Prefer the env-driven form for BooKoo.**
- Firebase files (`google-services.json`, `GoogleService-Info.plist`) are
  gitignored in FightingHows but **committed** in Martie. BooKoo: gitignore them.

### 6.19 `eas.json` — **VERBATIM** (Martie)

```json
{
  "cli": {
    "version": ">= 5.9.1",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development"
    },
    "preview": {
      "channel": "preview",
      "env": {"STAGE": "prod"},
      "cache": {"disabled": true},
      "distribution": "internal",
      "android": {"buildType": "apk"}
    },
    "amazon": { /* Martie-only Fire OS variant */ },
    "horizon": { /* Martie-only Meta Quest variant */ },
    "production": {
      "channel": "production",
      "autoIncrement": true,
      "env": {"STAGE": "prod"},
      "cache": {"disabled": true},
      "android": {"buildType": "app-bundle"}
    }
  },
  "submit": {
    "production": {
      "android": {"track": "production"},
      "ios": {"ascAppId": "6740057833"}
    }
  }
}
```

Key: `"appVersionSource": "remote"` (build numbers live on EAS, not in the repo)
and each profile injects `STAGE` into the build env, which `app.config.ts` then
uses to pick `.env.<STAGE>`.

### 6.20 `.env.sample` — **VERBATIM** (Martie)

```
# Deployment used by `npx convex dev`
CONVEX_DEPLOYMENT=

EXPO_PUBLIC_CONVEX_URL=
EXPO_PUBLIC_GROWTOKI_ENDPOINT=
EXPO_PUBLIC_GROWTOKI_WRITE_KEY=
SENTRY_AUTH_TOKEN=

# Required for `HORIZON_OS=1` builds. This is the Meta Horizon app ID
# injected into AndroidManifest.xml for Quest/Horizon IAP.
# HORIZON_APP_ID is also supported as a legacy fallback.
META_HORIZON_APP_ID=
```

**Env-file matrix in Martie** (all gitignored except `.env.sample`; `.env.prod`
is `!`-exempted in `.easignore` so it ships to EAS):

| file | keys present |
|---|---|
| `.env.local` | `CONVEX_DEPLOYMENT`, `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_GROWTOKI_ENDPOINT`, `EXPO_PUBLIC_GROWTOKI_WRITE_KEY`, `SENTRY_AUTH_TOKEN`, `EXPO_PUBLIC_CONVEX_SITE_URL` |
| `.env.development` | same as `.env.local` + `EXPO_PUBLIC_PAYMENT_MODE` |
| `.env.preview` | above minus `CONVEX_SITE_URL`, plus `META_HORIZON_APP_ID`, `EXPO_PUBLIC_PAYMENT_MODE` |
| `.env.production` | same as `.env.preview` |
| `.env.prod` | `CONVEX_DEPLOYMENT`, `EXPO_PUBLIC_CONVEX_URL`, growtoki pair, `SENTRY_AUTH_TOKEN`, `META_HORIZON_APP_ID` |

**FightingHows `.env.sample`** is the better template for BooKoo — it documents
both the **Expo-side** vars and the **Convex deployment env vars** (`bunx convex
env set`) in one file:

```
# Convex — `bunx convex dev` 가 .env.local 에 자동으로 채웁니다.
CONVEX_DEPLOYMENT=
EXPO_PUBLIC_CONVEX_URL=
EXPO_PUBLIC_CONVEX_SITE_URL=

# Google Sign-In (Google Cloud Console → OAuth 2.0 클라이언트 ID)
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=

# EAS (선택)
EAS_PROJECT_ID=

# 개발 전용 이메일 로그인 (OAuth 설정 전 / E2E 용).
EXPO_PUBLIC_ALLOW_DEV_LOGIN=true

# ─────────────────────────────────────────────────────────────
# 아래는 앱이 아니라 Convex 배포 환경변수입니다.
# `bunx convex env set <KEY> <VALUE>` 로 설정하세요.
#   APPLE_BUNDLE_ID / APPLE_SERVICE_ID
#   APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY   (Apple token revocation)
#   GOOGLE_IOS_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID / GOOGLE_WEB_CLIENT_ID
#   BOOTSTRAP_ADMIN_EMAILS
#   KAKAO_NATIVE_APP_KEY / KAKAO_REST_API_KEY
#   JWKS / JWT_PRIVATE_KEY   (`bunx @convex-dev/auth` 가 자동 생성)
```

### 6.21 `environment.d.ts` — **VERBATIM** (Martie)

```ts
declare module '*.svg' {
  import type {IconType} from './src/types';

  const content: IconType;
  export default content;
}

declare module '*.json' {
  const content;
  export default content;
}

declare module '*.png' {
  const content;
  export default content;
}

declare module '*.otf' {
  const content;
  export default content;
}

declare module '*.mp3' {
  const content;
  export default content;
}
```

Referenced via tsconfig `"files": ["environment.d.ts", "src/styled.d.ts"]`.
Requires `src/types` to export `IconType` (Martie's SVG icon type).
`expo-env.d.ts` is generated (`/// <reference types="expo/types" />`) and gitignored.

### 6.22 `.ncurc.json` — **VERBATIM** (Martie)

```json
{
  "reject": [
    "typescript",
    "eslint"
  ]
}
```

(`npm-check-updates` refuses to bump `typescript` and `eslint`. cpk-ui rejects
`@storybook/*` instead.)

### 6.23 `.easignore` — **VERBATIM** (Martie)

Standard RN/Xcode/Android ignore list, then these load-bearing lines at the end:

```
.env*
!.env.prod
!.env.sample
.jest

# Android
/android
*.aab

# iOS
/ios

# scripts
/scripts
convex/*
!convex/_generated

# @generated expo-cli sync-2b81b286409207a5da26e14c78851eb30d8ccbdb
# The following patterns were generated by expo-cli

expo-env.d.ts
# @end expo-cli

# Below is why we need .easignore
# https://github.com/expo/eas-cli/issues/1253
# google-services.json
# GoogleService-Info.plist
```

The meaningful decisions: **`.env.prod` and `.env.sample` are uploaded to EAS**
(everything else `.env*` is stripped), the whole `convex/` tree is stripped
**except `convex/_generated`**, and `/android` + `/ios` are stripped so EAS runs
prebuild itself. The trailing comment links `expo/eas-cli#1253` — `.easignore`
exists because `.gitignore` alone would strip the Firebase config files.

### 6.24 `.gitignore` (Martie) — agent-relevant lines

```
.env*
!.env.sample
app-example
.jest
/ios
/android
google-services.json          # (present in Martie's .gitignore but files ARE committed)
GoogleService-Info.plist
.claude/**local.json          # ← keeps settings.local.json out of git
programs/*/node_modules/
```

FightingHows adds `CLAUDE.local.md` and `/tmp`, `/.scratch`, `.e2e-artifacts/`.

### 6.25 `.cpk/expo` — **VERBATIM** (cpk-cli marker, 131 bytes)

```
/**
 * cpk-cli by hyochan
 * Do not delete this folder and files if you are using cpk-cli
 * https://www.npmjs.com/package/cpk
 */
```

### 6.26 `convex.json` (FightingHows only) — **VERBATIM**

```json
{
  "$schema": "node_modules/convex/schemas/convex.schema.json",
  "aiFiles": {
    "enabled": false
  }
}
```

---

## 7. `scripts/` — what each file does

### 7.1 Martie `scripts/`

| Path | What it does |
|---|---|
| `scripts/build-vega.sh` | Bash. Builds the Amazon **Vega/Kepler** VPKG from `apps/vega`. Sources `~/vega/env`, falls back to `~/vega/bin` on PATH and `~/vega/sdk` as `KEPLER_SDK_PATH`; errors with install instructions if `vega` CLI missing. Runs `npm --prefix apps/vega ci` only when `package.json`/`package-lock.json` is newer than `node_modules`. Reads app version from root `package.json` via `node -p`, build number from `$VEGA_BUILD_NUMBER` or `date +%s`, then `npm run build:release -- --build-version … --build-number … --reset-cache`. Wired as `bun eas:prod:vega`. **Martie-only, skip for BooKoo.** |
| `scripts/generateQuizFile.mjs` | Node ESM. Reads `quizzes` from `./inputs.mjs`, converts to seed rows keyed `${YYYYMMDD}_${0001}`, validates each quiz is an object with an `options` array, writes `scripts/data/<date>_quiz.ts` and a `ko.json`. Content-pipeline only. |
| `scripts/inputs.mjs` | 115 KB of raw quiz input data. |
| `scripts/quizzesOrganizer.ts` | 4.9 KB TS entrypoint (`scripts/package.json` `start` = `bun run quizzesOrganizer.ts`). |
| `scripts/quizPrompt.md` | 9.9 KB LLM prompt used to generate quizzes. |
| `scripts/locales/{ko,en,ja}.json` | Seed-side locale strings. |
| `scripts/quizzes/FIRST_1050.md` | Source quiz corpus. |
| `scripts/_seeds/` | 36 dated seed JSON/TS files consumed by Convex `seeds:*` functions. |
| `scripts/package.json` | Nested package (`name: quiz-extractor`, `type: module`, `packageManager: yarn@1.22.22`, devDeps `@types/node`, `ts-node`, `typescript ^5.9.3`). Isolates the script toolchain from the app. |
| `scripts/tsconfig.json` | Separate tsconfig for the script package (`target ES2020`, `module ESNext`, `moduleResolution Node`, `outDir ./dist`). Root tsconfig `exclude`s `scripts`. |

**The pattern worth copying:** scripts live in their own npm package with their
own `tsconfig.json`, and the root `tsconfig.json` `exclude`s `scripts` so app
typechecking never sees them. Metro `blockList`s the sibling `programs/` dir for
the same reason.

### 7.2 FightingHows `scripts/` (closer to what BooKoo needs)

| Path | What it does |
|---|---|
| `scripts/logo.ts` | **Single source of truth for the logo mark.** Editing generated output directly is banned by `src/AGENTS.md`. |
| `scripts/generate-assets.ts` | `bun scripts/generate-assets.ts` (npm script `assets:logo`). Regenerates `assets/*` icons/splash and `src/uis/LogoMark.tsx` from `logo.ts` using `sharp`. |
| `scripts/preview-logo.ts` | Local preview of the generated logo. |

### 7.3 Martie `package.json` scripts — the shape to copy

```
start                  expo start
start:prod             EXPO_NO_DOTENV=1 STAGE=prod dotenv -o -e .env.prod -- expo start
android / ios / web    expo run:* / expo start --web
android:prebuild       expo prebuild --platform android --no-install
lint                   eslint --ext .ts,.tsx,.js,.jsx src app test
lint:i18n              eslint --fix --ext .json --format node_modules/eslint-plugin-i18n-json/formatter.js assets/langs/
lint:all               bun lint && bun lint:i18n
fix:deps               expo install --fix
build:web              expo export --platform web
test                   jest --runInBand
eas:prod:updates[:ios|:android]   eas update --branch production --environment production --message "${EAS_UPDATE_MESSAGE:-…}"
eas:prod:{android,ios}            eas build --profile production --platform …
eas:prod:submit[:android|:ios]    eas submit --platform … --profile production --latest --non-interactive
eas:prod:build-submit[…]          eas build … --auto-submit --non-interactive
eas:secrets            eas env:push
```

The env prefix idiom is always
`EXPO_NO_DOTENV=1 STAGE=prod dotenv -o -e .env.prod -- <cmd>` (or
`dotenv -o -e .env.prod -- env EXPO_NO_DOTENV=1 STAGE=prod <cmd>` when extra
vars are needed). `EXPO_NO_DOTENV=1` stops Expo's own dotenv from re-reading and
lets `dotenv-cli` + `app.config.ts`'s STAGE block own it.

**FightingHows scripts** (simpler, closer to BooKoo day one):

```
start / android / ios / ios:device / web / prebuild
convex              convex dev
convex:deploy       convex deploy
typecheck           tsc --noEmit
lint                eslint --ext .ts,.tsx app src convex
lint:fix            eslint --fix --ext .ts,.tsx app src convex
format              prettier --write "{app,src,convex}/**/*.{ts,tsx}"
test                jest --runInBand
check               bun typecheck && bun lint          ← the gate the skills call
assets:logo         bun scripts/generate-assets.ts
seed                convex run seeds:seedAll
```

`bun check` is the single pre-commit/pre-PR gate name in FightingHows and is
referenced by name from its skills and `AGENTS.md`. **Adopt `bun check` in BooKoo.**

---

## 8. Version pins observed (2026-08 snapshot)

Martie and FightingHows agree on the shared stack:

| package | version |
|---|---|
| `expo` | `~57.0.9` |
| `expo-router` | `~57.0.9` |
| `react-native` | `0.86.2` |
| `react` / `react-dom` | `19.2.3` |
| `@types/react` | `~19.2.17` |
| `typescript` | `~6.0.3` |
| `cpk-ui` | `0.7.0` |
| `kstyled` | `0.4.1` |
| `babel-plugin-kstyled` | `0.4.1` |
| `@shopify/flash-list` | `2.0.2` |
| `convex` | `^1.42.3` |
| `@convex-dev/auth` | `^0.0.94` (devDependency in both) |
| `react-native-reanimated` | `4.5.1` |
| `react-native-worklets` | `0.10.1` |
| `react-native-safe-area-context` | `~5.7.0` |
| `react-native-screens` | `~4.26.0` |
| `react-native-gesture-handler` | `~2.32.0` |
| `react-native-mmkv` | `^3.3.3` |
| `react-native-keyboard-controller` | `1.21.9` |
| `react-native-edge-to-edge` | `1.8.1` |
| `react-native-svg` | `15.15.4` |
| `zustand` | `^5.0.14` |
| `jest` | `~29.7.0`, `jest-expo` `~57.0.3` |
| `eslint` | `^8.57.1`, `eslint-config-expo` `~57.0.1` |
| `prettier` | `^3.9.6` |
| `@commitlint/cli` | `^21.2.1`, `config-conventional` `^21.2.0` |
| `@testing-library/react-native` | `^13.3.3` |
| engines.node | `^22.13.0 \|\| >=24.3.0` |
| packageManager | Martie `bun@1.3.13`, FightingHows `bun@1.2.21` |
| CI node / bun | `22.14.0` / `1.3.13` |

Auth-provider packages (FightingHows, directly reusable for BooKoo's
Kakao/Naver/Google/Apple requirement):
`@react-native-seoul/kakao-login@^6.0.3`, `@react-native-seoul/naver-login@^5.0.1`,
`@react-native-google-signin/google-signin@^16.1.4`,
`expo-apple-authentication@~57.0.1`, `expo-crypto`, `jose@^6.2.5`
(used server-side in `convex/lib/idToken.ts` for ID-token verification).

`package.json` `expo.doctor.reactNativeDirectoryCheck.exclude` — FightingHows
lists `["cpk-ui","kstyled"]`; Martie lists `["@notifee/react-native",
"expo-ondevice-ai","expo-modules-jsi"]`. BooKoo needs at least
`["cpk-ui","kstyled"]`.

---

## 9. THE RECIPE — reproduce in BooKoo, file by file

Working root: `/Users/hyo/Github/hyodotdev/BooKoo`.
Assumes `BooKooLegacy/` stays read-only and is already in `.gitignore`.

### Step 0 — Order of operations

```
1. package.json + bun install         (§8 pins)
2. build configs                       (§9.1)
3. agent SSOT + sync script            (§9.2–9.4)
4. root AGENTS.md / CLAUDE.md          (§9.5)
5. per-directory AGENTS.md             (§9.6)
6. subagents                           (§9.7)
7. hooks + CI + editor                 (§9.8)
8. run `bash .agents/scripts/sync-skills.sh` and commit
```

### 9.1 Build/tooling files (copy with the noted edits)

| Create | From | Edit |
|---|---|---|
| `.prettierrc.js` | §6.11 | none |
| `.eslintrc.js` | FightingHows §6.12 | keep `@typescript-eslint/no-explicit-any: 'error'`; add `plugin:i18n-json/recommended` + the three `i18n-json` rules from Martie once `assets/langs/ko.json` exists; add `'src/styled.d.ts'` override |
| `custom-syntax-validator.ts` | §6.12 | fix the message to `underscore(_)` |
| `tsconfig.json` | FightingHows §6.13 | paths `~/* → ./src/*`, `@convex/* → ./convex/*`; add `"files": ["environment.d.ts","src/styled.d.ts"]` and `"typeRoots": [..., "./@types"]` if you keep `@types/jsx.d.ts` |
| `environment.d.ts` | §6.21 | drop the `*.svg → IconType` block until `src/types` exists, or define `IconType` first |
| `@types/jsx.d.ts` | §6.15 | none |
| `babel.config.js` | §6.17 | none — worklets plugin LAST |
| `metro.config.js` | FightingHows §6.16 | none |
| `jest.config.ts` | §6.14 | **fix** `convex/react.ts` → `.tsx`; **create** `__mocks__/svgMock.js` or delete the `\\.svg` mapping; drop `sentry-expo`/growtoki/ads/notifee/iap mocks that BooKoo does not use |
| `test/testSetup.ts` | Martie §6.15 | keep: fetch-mock, reanimated worklet init, `expo-router`, `expo-font`, async-storage, `NativeEventEmitter`, `convex/react`, `react-native-keyboard-controller`. Drop: firebase-analytics, google-mobile-ads, notifee, expo-audio, expo-iap |
| `test/testSetupAfterEnv.ts` | §6.15 | none |
| `test/testUtils.tsx` | §6.15 | swap `RootProvider` import path |
| `__mocks__/convex/{react.tsx,http.ts}`, `__mocks__/expo-asset.ts`, `__mocks__/expo-localization.ts`, `__mocks__/react-native-worklets.js`, `__mocks__/react-native-reanimated.js` | §6.15 | copy `react-native-reanimated.js` from `/Users/hyo/Github/hyodotdev/Martie/__mocks__/react-native-reanimated.js` |
| `commitlint.config.cjs` | §6.3 | none |
| `.ncurc.json` | §6.22 | `{"reject": ["typescript", "eslint"]}` |
| `.easignore` | §6.23 | swap Martie-specific comments; keep `!.env.prod`, `!.env.sample`, `convex/*` + `!convex/_generated` |
| `convex.json` | §6.26 | none |
| `app.config.ts` | §6.18 | **must set** `experiments.typedRoutes: true`, `userInterfaceStyle: 'automatic'` (root + android), `ios.supportsTablet: true`, `extra.eas.projectId: process.env.EAS_PROJECT_ID`, `locales: {ko,en,…}` for store metadata, plus the Martie `STAGE` dotenv block and FightingHows' conditional-plugin gating for Kakao/Google |
| `eas.json` | §6.19 | keep `cli.appVersionSource: "remote"`, `development`/`preview`/`production` profiles with `env.STAGE`; drop `amazon`/`horizon` |
| `.env.sample` | FightingHows §6.20 | list both `EXPO_PUBLIC_*` app vars and the `bunx convex env set` server vars |
| `.gitignore` | §6.24 | include `.env*` + `!.env.sample`, `.jest`, `/ios`, `/android`, `expo-env.d.ts`, `google-services.json`, `GoogleService-Info.plist`, `.claude/**local.json`, `CLAUDE.local.md`, `BooKooLegacy/` |

### 9.2 Create the canonical skill tree

```
.agents/
├── README.md
├── scripts/sync-skills.sh          (chmod +x)
└── skills/
    ├── commit/SKILL.md   + references/workflow.md
    ├── review-self/SKILL.md
    ├── review-pr/SKILL.md   + references/workflow.md
    ├── loop-review/SKILL.md
    ├── e2e-test/SKILL.md    + references/workflow.md
    ├── update-version/SKILL.md + references/workflow.md
    ├── release-update/SKILL.md
    └── perf-audit/SKILL.md          ← NEW, BooKoo-specific (see §9.9)
```

`.agents/README.md` = §2.1 with `Martie` → `BooKoo`, the layout block extended
with the Cursor line, and the "Current skills" table replaced:

```text
.claude/skills/<name>/SKILL.md        # pointer, Claude Code notes
.codex/skills/<name>/SKILL.md         # pointer, Codex notes
.codex/skills/<name>/agents/openai.yaml  # Codex-only interface metadata
.grok/skills/<name>/SKILL.md          # pointer, Grok notes
.cursor/rules/<name>.mdc              # pointer, Cursor notes (agent-requested rule)
```

| Skill | Purpose |
| --- | --- |
| `commit` | Branch checks, conventional commits, push, PR |
| `review-self` | Self-review loop over the current work until stable |
| `review-pr` | PR review findings and review-comment handling |
| `loop-review` | main → branch → review-self → PR → poll → verified merge |
| `e2e-test` | iOS simulator / Android emulator ledger-flow regression |
| `update-version` | Version bump and Convex force-update records |
| `release-update` | EAS build, store submit, Expo OTA rollout |
| `perf-audit` | Prove unbounded lists stay paginated and stay snappy |

### 9.3 `.agents/scripts/sync-skills.sh` — the BooKoo version (Claude + Codex + Grok + **Cursor**)

```bash
#!/usr/bin/env bash
# Generates the per-agent skill pointers from the canonical .agents/skills SSOT.
# Re-runnable: it overwrites every pointer it owns.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

canonical_dir=".agents/skills"

claude_notes() {
  cat <<'EOF'
## Claude Code Notes

- Sibling skills written as `$name` in the canonical file are Claude Code
  skills; invoke them as `/name` or through the Skill tool.
- Use the Agent tool (`Explore`) for read-only fan-out when the canonical file
  asks for independent review lenses.
- For any interval or recurring step, use `ScheduleWakeup` or `/loop`. Never
  emulate it with `sleep`, `while true`, or a detached background process.
EOF
}

codex_notes() {
  cat <<'EOF'
## Codex Notes

- Sibling skills written as `$name` are Codex skills; invoke them directly.
- This skill's Codex interface metadata lives in `agents/openai.yaml`.
- For any interval or recurring step, use a Codex automation. Never emulate it
  with `sleep`, `while true`, or a detached background process.
EOF
}

grok_notes() {
  cat <<'EOF'
## Grok Notes

- Sibling skills written as `$name` are Grok skills; invoke them as `/name` or
  `/skills <name>`.
- Grok has no built-in scheduler. For any interval or recurring step, finish the
  current round and report that automatic re-entry could not be scheduled.
  Never emulate it with `sleep`, `while true`, or a detached background process.
EOF
}

cursor_notes() {
  cat <<'EOF'
## Cursor Notes

- Sibling skills written as `$name` are sibling rules in `.cursor/rules/`;
  pull one in with `@<name>` or ask for it by name.
- This rule is agent-requested (`alwaysApply: false`), so restate the goal
  when you invoke it — it is not automatically in context.
- Cursor has no built-in scheduler. For any interval or recurring step, finish
  the current round and report that automatic re-entry could not be scheduled.
  Never emulate it with `sleep`, `while true`, or a detached background process.
EOF
}

write_pointer() {
  local agent_dir="$1" agent_label="$2" notes_fn="$3" name="$4" title="$5" description="$6"
  local out="$agent_dir/skills/$name/SKILL.md"
  mkdir -p "$(dirname "$out")"
  {
    printf -- '---\n'
    printf -- 'name: %s\n' "$name"
    printf -- 'description: %s\n' "$description"
    printf -- '---\n\n'
    printf -- '# %s (%s)\n\n' "$title" "$agent_label"
    printf -- 'Canonical definition: `%s/%s/SKILL.md`.\n\n' "$canonical_dir" "$name"
    printf -- 'Read that file — and every reference it points to — and follow it as\n'
    printf -- 'written. It is agent-neutral, so no section of it is written for another\n'
    printf -- 'agent. Relative paths inside it resolve under\n'
    printf -- '`%s/%s/`.\n\n' "$canonical_dir" "$name"
    "$notes_fn"
  } > "$out"
}

write_cursor_pointer() {
  local name="$1" title="$2" description="$3"
  local out=".cursor/rules/$name.mdc"
  mkdir -p "$(dirname "$out")"
  {
    printf -- '---\n'
    printf -- 'description: %s\n' "$description"
    printf -- 'globs:\n'
    printf -- 'alwaysApply: false\n'
    printf -- '---\n\n'
    printf -- '# %s (Cursor)\n\n' "$title"
    printf -- 'Canonical definition: `%s/%s/SKILL.md`.\n\n' "$canonical_dir" "$name"
    printf -- 'Read that file — and every reference it points to — and follow it as\n'
    printf -- 'written. It is agent-neutral, so no section of it is written for another\n'
    printf -- 'agent. Relative paths inside it resolve under\n'
    printf -- '`%s/%s/`.\n\n' "$canonical_dir" "$name"
    printf -- '@%s/%s/SKILL.md\n\n' "$canonical_dir" "$name"
    cursor_notes
  } > "$out"
}

for dir in "$canonical_dir"/*/; do
  name="$(basename "$dir")"
  skill="${dir%/}/SKILL.md"
  description="$(awk 'NR>1 && /^description: /{sub(/^description: /,""); print; exit}' "$skill")"
  title="$(awk '/^# /{sub(/^# /,""); print; exit}' "$skill")"
  [ -n "$description" ] || { echo "missing description: $skill" >&2; exit 1; }
  [ -n "$title" ] || { echo "missing title: $skill" >&2; exit 1; }
  case "$description" in
    '>'*|'|'*)
      echo "multi-line description is not supported: $skill" >&2; exit 1 ;;
  esac

  write_pointer .claude "Claude Code" claude_notes "$name" "$title" "$description"
  write_pointer .codex  "Codex"       codex_notes  "$name" "$title" "$description"
  write_pointer .grok   "Grok"        grok_notes   "$name" "$title" "$description"
  write_cursor_pointer "$name" "$title" "$description"
  echo "generated: $name"
done

# Prune pointers whose canonical skill is gone, so no agent advertises a skill
# that resolves to a missing file. Only the generated SKILL.md is removed;
# anything else in the directory is reported and left alone.
for agent_dir in .claude .codex .grok; do
  [ -d "$agent_dir/skills" ] || continue
  for pointer in "$agent_dir"/skills/*/; do
    name="$(basename "$pointer")"
    [ -d "$canonical_dir/$name" ] && continue
    rm -f "${pointer%/}/SKILL.md"
    rmdir "${pointer%/}" 2>/dev/null ||
      echo "pruned pointer, kept remaining files: ${pointer%/}" >&2
    echo "pruned: $agent_dir/$name"
  done
done

# Cursor rules are flat .mdc files. Hand-authored rules use a NN- prefix and are
# never generated, so they are never pruned.
if [ -d .cursor/rules ]; then
  for pointer in .cursor/rules/*.mdc; do
    [ -e "$pointer" ] || continue
    name="$(basename "$pointer" .mdc)"
    case "$name" in [0-9][0-9]-*) continue ;; esac
    [ -d "$canonical_dir/$name" ] && continue
    rm -f "$pointer"
    echo "pruned: .cursor/rules/$name.mdc"
  done
fi
```

`chmod +x .agents/scripts/sync-skills.sh`.

### 9.4 Hand-authored (never generated) agent files

```
.claude/settings.json                 §5.1 verbatim
.claude/agents/convex.md              §9.7
.claude/agents/mobile-ui.md           §9.7
.codex/skills/<name>/agents/openai.yaml  one per skill, §2.4 shape
.grok/README.md                       §5.3 verbatim (s/Grok already loads .claude\/commands/…/)
.grok/agents/convex.md                §9.7 (same body, Grok frontmatter)
.grok/agents/mobile-ui.md             §9.7
.cursor/rules/00-project.mdc          §4.5 — alwaysApply:true, @AGENTS.md + @CLAUDE.md
.vscode/mcp.json                      §6.9 verbatim (Convex MCP)
```

Add to `.gitignore`: `.claude/**local.json`, `CLAUDE.local.md`.

### 9.5 Root `AGENTS.md` and `CLAUDE.md` for BooKoo

`AGENTS.md` — take §3.1 verbatim with three edits:
1. Add Cursor to the Agent Skills paragraph:
   > Skills are defined once in `.agents/skills/<name>/SKILL.md` and mirrored to
   > `.claude/skills/`, `.codex/skills/`, `.grok/skills/`, and `.cursor/rules/`
   > as thin pointers. Edit the canonical file only, then run
   > `bash .agents/scripts/sync-skills.sh`. See `.agents/README.md`.
2. Extend the vendor-prefix ban: "such as `codex/`, `grok/`, `claude/`, or `cursor/`".
3. Add a **PR checklist** section (FightingHows pattern):
   > 1. `bun check` — `tsc --noEmit` + eslint pass
   > 2. `bunx convex dev --once` when `convex/**` changed
   > 3. `/e2e-test` when a screen changed

`CLAUDE.md` — §3.2 structure, BooKoo content. Skeleton:

```markdown
# BooKoo — 함께 쓰는 가계부

## Project Overview
Expo + Convex 공유 가계부(social ledger). 여러 사람이 한 장부를 함께 기록·조회한다.

## Tech Stack
- **Frontend**: React Native 0.86 (Expo SDK 57), expo-router (typed routes), kstyled, cpk-ui
- **Backend**: Convex (serverless DB + functions + file storage)
- **Auth**: Convex Auth (`@convex-dev/auth`) — Kakao / Naver / Google / Apple / email OTP
- **Lists**: `@shopify/flash-list` v2 + Convex `usePaginatedQuery`
- **Local state**: MMKV, Zustand
- **i18n**: `assets/langs/*.json` (ko, en, …)
- **Theming**: dark/light via `userInterfaceStyle: 'automatic'` + theme tokens
- **Layout**: tablet-aware via `isTablet` from `useCPK()`

## Key Architecture
- `convex/schema/` — table definitions split per file, assembled in `convex/schema.ts`
- `convex/lib/permissions.ts` — every function's first line
- `convex/{domain}/{queries,mutations}.ts`
- `app/` — expo-router routes
- `src/features/` — domain UI + hooks;  `src/uis/` — shared components
- `src/theme.ts` — the only source of colors

## Agent Skills
Skills are defined once in `.agents/skills/<name>/SKILL.md` and mirrored to
`.claude/skills/`, `.codex/skills/`, `.grok/skills/`, and `.cursor/rules/` as
thin pointers. Edit the canonical file only, then run
`bash .agents/scripts/sync-skills.sh`. See `.agents/README.md`.

## List & Pagination Rules
<§3.1 block verbatim — this is THE rule that fixes legacy BooKoo's slowness>
+ Ledger entries, comments, members, and notifications are ALL unbounded.
+ Aggregates (monthly totals, category sums) must be precomputed/denormalized —
  never derived by reading every entry on the client.

## TypeScript Rules
<§3.2 block verbatim>

## Styling Rules
- `kstyled` `styled` / `css`. Numbers in css templates are unit strings:
  `${bottom + 'px'}`, not `${bottom}px`. `font-family` without quotes.
- Text is `Typography.*` from cpk-ui. RN `Text` is banned.
- Colors come from `src/theme.ts` only. No hardcoded hex.
- Tablet branches use `isTablet` from `useCPK()`.

---

## Coding Principles (Karpathy-inspired)
<§3.2 block verbatim, with `bun check` substituted for `npx tsc --noEmit`>
```

### 9.6 Per-directory `AGENTS.md`

Create `app/AGENTS.md`, `src/AGENTS.md`, `convex/AGENTS.md` modelled on §5.4.
BooKoo versions must state, at minimum:

- `convex/AGENTS.md`: permissions helper first line; `ConvexError({code,message})`;
  `paginationOptsValidator` + `.paginate()` + matching index, no uncapped
  `.collect()`; `deletedAt` soft delete; schema in `schema/*.ts` → `schema.ts`;
  never edit `convex/_generated/**`; verify with `bunx convex dev --once`.
- `app/AGENTS.md`: typed routes, no `as any`; auth gate location; new route ⇒
  update the stage allowlist; tablet layout branch expectations.
- `src/AGENTS.md`: `Typography.*` not RN `Text`; kstyled + theme tokens;
  FlashList + `usePaginatedQuery` + `onEndReached`; i18n keys are literals.

### 9.7 Domain subagents

Copy §5.5 bodies, retarget to BooKoo. Two files each, one per agent dir:

- `.claude/agents/convex.md` — frontmatter `name`, `description` (+ optional
  `tools`, `model`).
- `.grok/agents/convex.md` — frontmatter `name`, `description: >`,
  `prompt_mode: full`, `permission_mode: default`, `agents_md: true`.
- same pair for `mobile-ui`.

Suggested third subagent for BooKoo: **`perf`** — owns the "stay snappy with
unbounded data" mandate (index coverage, pagination page sizes, FlashList
`estimatedItemSize`/`getItemType`, memoized row components, denormalized
aggregates). Restricted read/write to `convex/` + `src/features/*/`.

### 9.8 Hooks, CI, editor

```
.husky/pre-commit      §6.1, but body = `bun check` + `bun test`   (chmod +x)
.husky/commit-msg      §6.2 verbatim                                (chmod +x)
commitlint.config.cjs  §6.3 verbatim
.github/workflows/ci.yml   §6.4 minus the "Build shorts typescript" step;
                           replace `bun lint:all` + `bun tsc` with `bun check`
.vscode/settings.json      §6.6 (swap cSpell words: BooKoo, kstyled, convex,
                           kakao, naver, paginated, gagyebu …)
.vscode/extensions.json    §6.7 (drop `styled-components.vscode-styled-components`
                           if kstyled has no VS Code plugin)
.vscode/launch.json        §6.8 verbatim
.vscode/mcp.json           §6.9 verbatim
.vscode/bookoo.code-snippets  §6.10 rewritten for kstyled:
                              import styled from 'kstyled';
```

### 9.9 New BooKoo-only skill: `perf-audit`

Rationale: the stated failure mode of legacy BooKoo is "got slow as ledgers
grew". Make it a first-class, invocable procedure, not a paragraph in CLAUDE.md.

`.agents/skills/perf-audit/SKILL.md` frontmatter (**single-line description** —
required by the sync script):

```markdown
---
name: perf-audit
description: Audit BooKoo for unbounded-data performance regressions. Use when the user runs `/perf-audit` or `$perf-audit`, asks why a screen is slow, adds a new list or Convex query, or before merging anything that touches ledger entries, comments, members, or notifications. Checks FlashList usage, Convex pagination and indexes, denormalized aggregates, and render cost.
---

# Perf Audit
```

Body checklist (agent-neutral):
1. Enumerate every `useQuery`/`usePaginatedQuery` call site and every list render.
2. Fail any list over unbounded data that is not `FlashList` +
   `usePaginatedQuery` + `onEndReached`.
3. Fail any Convex query using `.collect()` without a hard cap, or `.paginate()`
   without a matching `withIndex`.
4. Fail any client-side aggregate over a growing table; require a denormalized
   counter/rollup table updated in the same mutation.
5. Check `FlashList` props: stable `keyExtractor`, `getItemType` when rows are
   heterogeneous, memoized row components, no inline object/array/function props.
6. Report a table: screen → data source → index → page size → verdict.

---

## 10. Gotchas, risks, and deliberate deviations

1. **`description:` must be one line.** `sync-skills.sh` hard-fails on
   `description: >` / `description: |`. FightingHows' skills use block scalars —
   do not copy those frontmatters verbatim into a synced repo.
2. **Pointers are generated; never hand-edit.** Any manual change is lost on the
   next sync. Codex's `agents/openai.yaml` and Grok's `agents/*.md` ARE
   hand-authored and are NOT touched by the script.
3. **Prune leaves orphan dirs.** Deleting a canonical skill removes the pointer
   `SKILL.md` but `rmdir` fails when `.codex/skills/<name>/agents/openai.yaml`
   remains; the script prints a warning. Clean up manually.
4. **`jest.config.ts` moduleNameMapper has two dead paths in Martie**:
   `__mocks__/svgMock.js` does not exist, and `__mocks__/convex/react.ts` should
   be `.tsx`. Fix both when copying.
5. **`custom-syntax-validator.ts` error message is wrong** ("underbar(-)"
   instead of "underscore(_)").
6. **`.vscode/extensions.json` has a trailing comma** — valid JSONC for VS Code,
   invalid for `JSON.parse`. Don't feed it to a strict parser.
7. **`react-native-worklets/plugin` must be the last Babel plugin.** Reanimated
   v4 moved the plugin there; ordering breaks worklets silently.
8. **`.claude/settings.json` sets `defaultMode: "bypassPermissions"`** —
   repo-wide auto-approval for Claude Code. That is the observed Martie and
   FightingHows convention; adopt it only if that is intended for BooKoo.
9. **`.vscode/settings.json` sets `"claudeCode.allowDangerouslySkipPermissions": true`** —
   same caveat.
10. **Martie commits `google-services.json` / `GoogleService-Info.plist`** even
    though `.gitignore` lists them (added before the ignore rule). FightingHows
    does not. BooKoo should not.
11. **`.easignore` strips `convex/` except `_generated`** — if BooKoo's build
    needs anything else from `convex/`, the EAS build will fail confusingly.
12. **CLAUDE.md's tech-stack line is stale in Martie** (says "Emotion Native"
    while `package.json` ships `kstyled@0.4.1` + `babel-plugin-kstyled@0.4.1`
    and no `@emotion/*`). Same drift in `.github/copilot-instructions.md` and
    `.vscode/cpk.code-snippets`. Do not copy the emotion guidance.
13. **`typescript: ~6.0.3` with `eslint: ^8.57.1`** — the legacy `.eslintrc.js`
    format plus TS 6. `.ncurc.json` rejects both on purpose; do not "upgrade" them.
14. **`.jest/` is gitignored** but is also in `.easignore`; it holds only the
    jest cache. Nothing to author.
15. **Martie has no `.claude/commands/`** — skills replaced commands. Cursor's
    `.cursor/rules/` is the closest equivalent and needs `alwaysApply: false` +
    a good `description` to behave like an agent-requested skill.
16. **Cursor rule name = filename.** There is no `name:` frontmatter key, so the
    generated `.mdc` filename must exactly equal the canonical skill directory
    name, or `@name` invocation and cross-skill `$name` references break.
17. **`AGENTS.md` is read by Codex, Grok, and recent Cursor; `CLAUDE.md` by
    Claude (and Grok).** That is why Martie duplicates the pagination rule block
    into both files verbatim. Keep the duplication — a single "see the other
    file" pointer loses the rule for whichever agent doesn't follow the link.

---

## 11. Exact source paths (for re-reading if needed)

```
/Users/hyo/Github/hyodotdev/Martie/.agents/README.md
/Users/hyo/Github/hyodotdev/Martie/.agents/scripts/sync-skills.sh
/Users/hyo/Github/hyodotdev/Martie/.agents/skills/<name>/SKILL.md
/Users/hyo/Github/hyodotdev/Martie/.agents/skills/<name>/references/workflow.md
/Users/hyo/Github/hyodotdev/Martie/.agents/skills/analyze/scripts/analyze_martie_metrics.py
/Users/hyo/Github/hyodotdev/Martie/.claude/settings.json
/Users/hyo/Github/hyodotdev/Martie/.claude/settings.local.json          (gitignored)
/Users/hyo/Github/hyodotdev/Martie/.claude/skills/<name>/SKILL.md       (generated)
/Users/hyo/Github/hyodotdev/Martie/.codex/skills/<name>/SKILL.md        (generated)
/Users/hyo/Github/hyodotdev/Martie/.codex/skills/<name>/agents/openai.yaml
/Users/hyo/Github/hyodotdev/Martie/.grok/skills/<name>/SKILL.md         (generated)
/Users/hyo/Github/hyodotdev/Martie/AGENTS.md
/Users/hyo/Github/hyodotdev/Martie/CLAUDE.md
/Users/hyo/Github/hyodotdev/Martie/.github/workflows/{ci.yml,deploy.yml}
/Users/hyo/Github/hyodotdev/Martie/.github/copilot-instructions.md
/Users/hyo/Github/hyodotdev/Martie/.husky/{pre-commit,commit-msg}
/Users/hyo/Github/hyodotdev/Martie/commitlint.config.cjs
/Users/hyo/Github/hyodotdev/Martie/.vscode/{settings.json,extensions.json,launch.json,mcp.json,cpk.code-snippets}
/Users/hyo/Github/hyodotdev/Martie/{.eslintrc.js,.eslintignore,.prettierrc.js,.ncurc.json,.easignore}
/Users/hyo/Github/hyodotdev/Martie/{tsconfig.json,jest.config.ts,metro.config.js,babel.config.js}
/Users/hyo/Github/hyodotdev/Martie/{app.config.ts,eas.json,environment.d.ts,expo-env.d.ts,config.ts}
/Users/hyo/Github/hyodotdev/Martie/custom-syntax-validator.ts
/Users/hyo/Github/hyodotdev/Martie/{__mocks__/,test/,@types/jsx.d.ts}
/Users/hyo/Github/hyodotdev/Martie/scripts/{build-vega.sh,generateQuizFile.mjs,quizzesOrganizer.ts,package.json,tsconfig.json}

/Users/hyo/Github/hyodotdev/FightingHows/.agents/README.md
/Users/hyo/Github/hyodotdev/FightingHows/.claude/commands/*.md          (symlinks — old pattern)
/Users/hyo/Github/hyodotdev/FightingHows/.grok/{README.md,agents/convex.md,agents/mobile-ui.md}
/Users/hyo/Github/hyodotdev/FightingHows/{AGENTS.md,CLAUDE.md}
/Users/hyo/Github/hyodotdev/FightingHows/{app,src,convex}/AGENTS.md
/Users/hyo/Github/hyodotdev/FightingHows/{.eslintrc.js,tsconfig.json,babel.config.js,metro.config.js,convex.json}
/Users/hyo/Github/hyodotdev/FightingHows/{app.config.ts,.env.sample,package.json}

/Users/hyo/Github/crossplatformkorea/cpk-ui/{commitlint.config.cjs,.ncurc.json,.husky/,.claude/commands/}
```
