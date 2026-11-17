---
name: loop-ui
description: Inspect BooKoo page by page on running devices, exercise interactions, fix verified UI/UX defects, and refresh the screenshot storyboard. Use when the user runs `/loop-ui` or `$loop-ui`, asks for a whole-app visual quality loop, or requests screenshot-driven UI refinement. A screenshot export alone is not this audit.
---

# Loop UI (Claude Code)

Canonical definition: `.agents/skills/loop-ui/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/loop-ui/`.

## Claude Code Notes

- Sibling skills written as `$name` in the canonical file are Claude Code
  skills; invoke them as `/name` or through the Skill tool.
- Use the Agent tool (`Explore`) for read-only fan-out when the canonical file
  asks for independent review lenses.
- For any interval or recurring step, use `ScheduleWakeup` or `/loop`. Never
  emulate it with `sleep`, `while true`, or a detached background process.
