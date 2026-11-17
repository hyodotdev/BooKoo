---
name: grow
description: Run one privacy-preserving BooKoo growth round from verified aggregate evidence, select exactly one experiment, and record its hypothesis and verification date. Use when the user runs `/grow` or `$grow`, asks what will improve BooKoo growth, activation, retention, invitations, store conversion, or Shipaton traction.
---

# BooKoo Growth Round (Grok)

Canonical definition: `.agents/skills/grow/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/grow/`.

## Grok Notes

- Sibling skills written as `$name` are Grok skills; invoke them as `/name` or
  `/skills <name>`.
- Grok has no built-in scheduler. For any interval or recurring step, finish the
  current round and report that automatic re-entry could not be scheduled.
  Never emulate it with `sleep`, `while true`, or a detached background process.
