---
name: perf-audit
description: Audit BooKoo for unbounded-data performance regressions. Use when the user runs `/perf-audit` or `$perf-audit`, asks why a screen is slow, adds a new list or Convex query, or before merging anything that touches ledger entries, comments, members, or notifications. Checks FlashList usage, Convex pagination and indexes, denormalized aggregates, and render cost.
---

# Perf Audit (Claude Code)

Canonical definition: `.agents/skills/perf-audit/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/perf-audit/`.

## Claude Code Notes

- Sibling skills written as `$name` in the canonical file are Claude Code
  skills; invoke them as `/name` or through the Skill tool.
- Use the Agent tool (`Explore`) for read-only fan-out when the canonical file
  asks for independent review lenses.
- For any interval or recurring step, use `ScheduleWakeup` or `/loop`. Never
  emulate it with `sleep`, `while true`, or a detached background process.
