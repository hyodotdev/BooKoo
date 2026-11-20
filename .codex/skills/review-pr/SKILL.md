---
name: review-pr
description: Review BooKoo GitHub pull requests. Use when the user runs `/review-pr` or `$review-pr`, asks for PR review, wants actionable findings, or asks to address PR review comments.
---

# Review PR (Codex)

Canonical definition: `.agents/skills/review-pr/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/review-pr/`.

## Codex Notes

- Sibling skills written as `$name` are Codex skills; invoke them directly.
- This skill's Codex interface metadata lives in `agents/openai.yaml`.
- Use supported bounded tool waits for an active task's review/check interval.
  Do not create an automation to monitor one task to completion. Standing daily
  project work may use one Codex automation when the user requested it.
  Never emulate recurrence with shell sleep loops or detached background jobs.
