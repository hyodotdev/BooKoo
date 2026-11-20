---
name: analyze
description: Analyze BooKoo aggregate product, store, IAPKit, and approved operational metrics without exposing private ledger data or silently adding automatic analytics. Use when the user runs `/analyze` or `$analyze`, asks to analyze BooKoo funnels, retention, invitations, store metrics, monetization, or growth evidence.
---

# BooKoo Analytics (Codex)

Canonical definition: `.agents/skills/analyze/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/analyze/`.

## Codex Notes

- Sibling skills written as `$name` are Codex skills; invoke them directly.
- This skill's Codex interface metadata lives in `agents/openai.yaml`.
- Use supported bounded tool waits for an active task's review/check interval.
  Do not create an automation to monitor one task to completion. Standing daily
  project work may use one Codex automation when the user requested it.
  Never emulate recurrence with shell sleep loops or detached background jobs.
