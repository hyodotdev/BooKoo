---
name: maintain
description: Complete one serialized BooKoo maintenance or owner-directed product cycle, recovering existing work and releases before selecting, verifying, integrating and delivering one bounded bundle. Use when the user runs `/maintain` or `$maintain`, requests autonomous upkeep, or a configured daily maintenance run resumes.
---

# Maintain (Claude Code)

Canonical definition: `.agents/skills/maintain/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/maintain/`.

## Claude Code Notes

- Sibling skills written as `$name` in the canonical file are Claude Code
  skills; invoke them as `/name` or through the Skill tool.
- Use the Agent tool (`Explore`) for read-only fan-out when the canonical file
  asks for independent review lenses.
- For any interval or recurring step, use `ScheduleWakeup` or `/loop`. Never
  emulate it with `sleep`, `while true`, or a detached background process.
