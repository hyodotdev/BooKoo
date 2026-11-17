---
name: e2e-test
description: Run BooKoo functional E2E on connected iOS/Android devices and available simulators. Use for /e2e-test, $e2e-test, device regression, or release verification of ledger, account, media and purchase flows.
---

# E2E Test (Grok)

Canonical definition: `.agents/skills/e2e-test/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/e2e-test/`.

## Grok Notes

- Sibling skills written as `$name` are Grok skills; invoke them as `/name` or
  `/skills <name>`.
- Grok has no built-in scheduler. For any interval or recurring step, finish the
  current round and report that automatic re-entry could not be scheduled.
  Never emulate it with `sleep`, `while true`, or a detached background process.
