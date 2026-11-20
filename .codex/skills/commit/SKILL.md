---
name: commit
description: Commit BooKoo repository changes safely. Use when the user runs `/commit` or `$commit`, asks to commit, push, or open a PR. Handles branch checks, conventional commit messages, validation, staging, push, and optional PR creation.
---

# Commit (Codex)

Canonical definition: `.agents/skills/commit/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/commit/`.

## Codex Notes

- Sibling skills written as `$name` are Codex skills; invoke them directly.
- This skill's Codex interface metadata lives in `agents/openai.yaml`.
- Use supported bounded tool waits for an active task's review/check interval.
  Do not create an automation to monitor one task to completion. Standing daily
  project work may use one Codex automation when the user requested it.
  Never emulate recurrence with shell sleep loops or detached background jobs.
