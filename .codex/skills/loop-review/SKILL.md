---
name: loop-review
description: Run BooKoo's complete change-to-merge loop from the latest origin/main; create a semantic branch, implement and verify the change, stabilize with review-self, commit and open a PR, poll CI every five minutes with an exact-head review-self fallback, fix and reverify findings, gate the performance and device regressions, and merge only when the exact head is clean. Use when the user runs `/loop-review` or `$loop-review`, or asks for the recurring review-self then commit --pr then review-pr until clean then merge workflow.
---

# Loop Review (Codex)

Canonical definition: `.agents/skills/loop-review/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/loop-review/`.

## Codex Notes

- Sibling skills written as `$name` are Codex skills; invoke them directly.
- This skill's Codex interface metadata lives in `agents/openai.yaml`.
- Use supported bounded tool waits for an active task's review/check interval.
  Do not create an automation to monitor one task to completion. Standing daily
  project work may use one Codex automation when the user requested it.
  Never emulate recurrence with shell sleep loops or detached background jobs.
