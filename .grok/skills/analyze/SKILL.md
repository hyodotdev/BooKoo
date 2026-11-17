---
name: analyze
description: Analyze BooKoo aggregate product, store, IAPKit, and approved operational metrics without exposing private ledger data or silently adding automatic analytics. Use when the user runs `/analyze` or `$analyze`, asks to analyze BooKoo funnels, retention, invitations, store metrics, monetization, or growth evidence.
---

# BooKoo Analytics (Grok)

Canonical definition: `.agents/skills/analyze/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/analyze/`.

## Grok Notes

- Sibling skills written as `$name` are Grok skills; invoke them as `/name` or
  `/skills <name>`.
- Grok has no built-in scheduler. For any interval or recurring step, finish the
  current round and report that automatic re-entry could not be scheduled.
  Never emulate it with `sleep`, `while true`, or a detached background process.
