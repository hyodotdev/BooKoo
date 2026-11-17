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
- For any interval or recurring step, use a Codex automation. Never emulate it
  with `sleep`, `while true`, or a detached background process.
