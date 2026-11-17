---
name: analyze
description: Analyze BooKoo aggregate product, store, IAPKit, and approved operational metrics without exposing private ledger data or silently adding automatic analytics. Use when the user runs `/analyze` or `$analyze`, asks to analyze BooKoo funnels, retention, invitations, store metrics, monetization, or growth evidence.
---

# BooKoo Analytics (Claude Code)

Canonical definition: `.agents/skills/analyze/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/analyze/`.

## Claude Code Notes

- Sibling skills written as `$name` in the canonical file are Claude Code
  skills; invoke them as `/name` or through the Skill tool.
- Use the Agent tool (`Explore`) for read-only fan-out when the canonical file
  asks for independent review lenses.
- For any interval or recurring step, use `ScheduleWakeup` or `/loop`. Never
  emulate it with `sleep`, `while true`, or a detached background process.
