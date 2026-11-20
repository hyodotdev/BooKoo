---
name: maintain
description: Complete one serialized BooKoo maintenance or owner-directed product cycle, recovering existing work and releases before selecting, verifying, integrating and delivering one bounded bundle. Use when the user runs `/maintain` or `$maintain`, requests autonomous upkeep, or a configured daily maintenance run resumes.
---

# Maintain (Grok)

Canonical definition: `.agents/skills/maintain/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/maintain/`.

## Grok Notes

- Sibling skills written as `$name` are Grok skills; invoke them as `/name` or
  `/skills <name>`.
- Grok has no built-in scheduler. For any interval or recurring step, finish the
  current round and report that automatic re-entry could not be scheduled.
  Never emulate it with `sleep`, `while true`, or a detached background process.
