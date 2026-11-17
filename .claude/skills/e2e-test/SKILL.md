---
name: e2e-test
description: Run BooKoo functional E2E on connected iOS/Android devices and available simulators. Use for /e2e-test, $e2e-test, device regression, or release verification of ledger, account, media and purchase flows.
---

# E2E Test (Claude Code)

Canonical definition: `.agents/skills/e2e-test/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/e2e-test/`.

## Claude Code Notes

- Sibling skills written as `$name` in the canonical file are Claude Code
  skills; invoke them as `/name` or through the Skill tool.
- Use the Agent tool (`Explore`) for read-only fan-out when the canonical file
  asks for independent review lenses.
- For any interval or recurring step, use `ScheduleWakeup` or `/loop`. Never
  emulate it with `sleep`, `while true`, or a detached background process.
