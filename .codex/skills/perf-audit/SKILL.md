---
name: perf-audit
description: Audit BooKoo for unbounded-data performance regressions. Use when the user runs `/perf-audit` or `$perf-audit`, asks why a screen is slow, adds a new list or Convex query, or before merging anything that touches ledger entries, comments, members, or notifications. Checks FlashList usage, Convex pagination and indexes, denormalized aggregates, and render cost.
---

# Perf Audit (Codex)

Canonical definition: `.agents/skills/perf-audit/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/perf-audit/`.

## Codex Notes

- Sibling skills written as `$name` are Codex skills; invoke them directly.
- This skill's Codex interface metadata lives in `agents/openai.yaml`.
- Use supported bounded tool waits for an active task's review/check interval.
  Do not create an automation to monitor one task to completion. Standing daily
  project work may use one Codex automation when the user requested it.
  Never emulate recurrence with shell sleep loops or detached background jobs.
