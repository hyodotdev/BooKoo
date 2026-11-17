---
name: loop-ui
description: Inspect BooKoo page by page on running devices, exercise interactions, fix verified UI/UX defects, and refresh the screenshot storyboard. Use when the user runs `/loop-ui` or `$loop-ui`, asks for a whole-app visual quality loop, or requests screenshot-driven UI refinement. A screenshot export alone is not this audit.
---

# Loop UI (Codex)

Canonical definition: `.agents/skills/loop-ui/SKILL.md`.

Read that file — and every reference it points to — and follow it as
written. It is agent-neutral, so no section of it is written for another
agent. Relative paths inside it resolve under
`.agents/skills/loop-ui/`.

## Codex Notes

- Sibling skills written as `$name` are Codex skills; invoke them directly.
- This skill's Codex interface metadata lives in `agents/openai.yaml`.
- For any interval or recurring step, use a Codex automation. Never emulate it
  with `sleep`, `while true`, or a detached background process.
