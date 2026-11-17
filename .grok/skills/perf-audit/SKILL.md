---
name: perf-audit
description: Audit BooKoo for unbounded-data performance regressions. Use when the user runs `/perf-audit` or `$perf-audit`, asks why a screen is slow, adds a new list or Convex query, or before merging anything that touches ledger entries, comments, members, or notifications. Checks FlashList usage, Convex pagination and indexes, denormalized aggregates, and render cost.
---

# Perf Audit (Grok)

Canonical definition: `.agents/skills/perf-audit/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/perf-audit/`.

## Grok Notes

- Sibling skills written as `$name` are Grok skills; invoke them as `/name` or
  `/skills <name>`.
- Grok has no built-in scheduler. For any interval or recurring step, finish the
  current round and report that automatic re-entry could not be scheduled.
  Never emulate it with `sleep`, `while true`, or a detached background process.
