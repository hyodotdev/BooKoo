---
name: grow
description: Run one privacy-preserving BooKoo growth round from verified aggregate evidence, select exactly one experiment, and record its hypothesis and verification date. Use when the user runs `/grow` or `$grow`, asks what will improve BooKoo growth, activation, retention, invitations, store conversion, or Shipaton traction.
---

# BooKoo Growth Round (Codex)

Canonical definition: `.agents/skills/grow/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/grow/`.

## Codex Notes

- Sibling skills written as `$name` are Codex skills; invoke them directly.
- This skill's Codex interface metadata lives in `agents/openai.yaml`.
- Use supported bounded tool waits for an active task's review/check interval.
  Do not create an automation to monitor one task to completion. Standing daily
  project work may use one Codex automation when the user requested it.
  Never emulate recurrence with shell sleep loops or detached background jobs.
