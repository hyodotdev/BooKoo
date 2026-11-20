---
name: release-update
description: Build, verify, submit, and publish BooKoo releases through local EAS Build, Codemagic Patch OTA, Google Play, and App Store Connect. Use when the user runs `/release-update` or `$release-update`, asks to release or deploy BooKoo, upload IPA/AAB artifacts, submit store builds for review, add release notes, choose between a native build and an OTA update, or finish a version rollout after review and E2E.
---

# Release Update (Codex)

Canonical definition: `.agents/skills/release-update/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/release-update/`.

## Codex Notes

- Sibling skills written as `$name` are Codex skills; invoke them directly.
- This skill's Codex interface metadata lives in `agents/openai.yaml`.
- Use supported bounded tool waits for an active task's review/check interval.
  Do not create an automation to monitor one task to completion. Standing daily
  project work may use one Codex automation when the user requested it.
  Never emulate recurrence with shell sleep loops or detached background jobs.
