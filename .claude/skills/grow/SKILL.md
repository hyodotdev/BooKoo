---
name: grow
description: Run one privacy-preserving BooKoo growth round from verified aggregate evidence, select exactly one experiment, and record its hypothesis and verification date. Use when the user runs `/grow` or `$grow`, asks what will improve BooKoo growth, activation, retention, invitations, store conversion, or Shipaton traction.
---

# BooKoo Growth Round (Claude Code)

Canonical definition: `.agents/skills/grow/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/grow/`.

## Claude Code Notes

- Sibling skills written as `$name` in the canonical file are Claude Code
  skills; invoke them as `/name` or through the Skill tool.
- Use the Agent tool (`Explore`) for read-only fan-out when the canonical file
  asks for independent review lenses.
- For any interval or recurring step, use `ScheduleWakeup` or `/loop`. Never
  emulate it with `sleep`, `while true`, or a detached background process.
