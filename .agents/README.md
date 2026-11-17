# Agent Skills

One skill set, shared by every coding agent used on BooKoo.

## Layout

```text
.agents/skills/<name>/SKILL.md        # canonical definition (edit only here)
.agents/skills/<name>/references/     # long-form procedures the SKILL.md links
.agents/skills/<name>/scripts/        # helper scripts the SKILL.md links
.agents/scripts/sync-skills.sh        # regenerates every pointer below

.claude/skills/<name>/SKILL.md        # pointer, Claude Code notes
.codex/skills/<name>/SKILL.md         # pointer, Codex notes
.codex/skills/<name>/agents/openai.yaml  # Codex-only interface metadata
.grok/skills/<name>/SKILL.md          # pointer, Grok notes
.cursor/rules/<name>.mdc              # pointer, Cursor notes (agent-requested rule)
```

Each agent discovers skills from its own directory, so all four see the same
names, the same `description` triggers, and the same procedure. Only the short
"Notes" section differs — it maps agent-neutral instructions (`$name`,
"schedule the next round") onto that agent's actual mechanism.

Cursor rules are flat files, so the generated `.mdc` filename **is** the rule
name and must equal the canonical directory name. Hand-authored Cursor rules use
a `NN-` prefix (for example `00-project.mdc`) and are never generated or pruned.

## Rules

- Edit `.agents/skills/<name>/SKILL.md` and its `references/`. Never edit a
  pointer by hand; `sync-skills.sh` overwrites it.
- Keep canonical files agent-neutral: no `ScheduleWakeup`, no `/loop`, no
  Codex-, Grok-, or Cursor-specific tool names. Those belong in the per-agent
  notes.
- `description` must be a single line. The sync script rejects `description: >`
  and `description: |`.
- After any canonical change, run the sync so the `description` triggers stay
  identical across agents:

  ```bash
  bash .agents/scripts/sync-skills.sh
  ```

## Adding a skill

1. Create `.agents/skills/<name>/SKILL.md` with `name` and `description`
   frontmatter and an `# H1` title. Write the trigger as
   ``Use when the user runs `/<name>` or `$<name>`, ...`` so every agent's
   invocation syntax matches.
2. Put anything long in `.agents/skills/<name>/references/`.
3. Run `bash .agents/scripts/sync-skills.sh`.
4. Add `.codex/skills/<name>/agents/openai.yaml` if the skill should show up in
   the Codex skill picker.

## Current skills

| Skill | Purpose |
| --- | --- |
| `commit` | Branch checks, conventional commits, push, PR |
| `review-self` | Self-review loop over the current work until stable |
| `review-pr` | PR review findings and review-comment handling |
| `loop-review` | main → branch → review-self → PR → poll → verified merge |
| `loop-ui` | Page-by-page device inspection → interaction fixes → verified storyboard |
| `e2e-test` | iOS simulator / Android emulator ledger-flow regression |
| `update-version` | Version bump and Convex force-update records |
| `release-update` | EAS build, store submit, Expo OTA rollout |
| `perf-audit` | Prove unbounded lists stay paginated and stay snappy |
| `analyze` | Interpret privacy-preserving aggregate product and store metrics |
| `grow` | Run one measured growth experiment and record its outcome |
