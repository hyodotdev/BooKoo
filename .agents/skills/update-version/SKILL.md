---
name: update-version
description: Update the BooKoo app version and, when asked, the Convex force-update record. Use when the user runs `/update-version` or `$update-version`, asks to bump the app version, release a version, or configure force-update behavior for older clients.
---

# Update Version

Use `references/workflow.md` as the detailed version and force-update checklist.

## Workflow

1. Parse the requested semantic version and whether `--force` was requested.
2. Update the marketing/store `version` in `package.json`; `app.config.ts`
   reads it. Never duplicate that marketing version in a screen.
3. Inspect native compatibility before building or publishing. Codemagic Patch
   targets OTA releases by this marketing version and checks the native
   fingerprint. Whenever native dependencies, plugins, permissions or the
   native contract change, ship new iOS and Android binaries before any OTA
   that depends on them.
   A metadata-only version change may retain the existing runtime only after
   confirming the native contract is unchanged and recording that decision.
   Historical iOS1.1.1 deliberately retained runtime1.1.0 for live Android32/iOS41.
   `config.ts` exports the installed native version using expo-application;
   manifest version is only a web/Expo Go fallback.
4. For `--force`, warn that the store version must already be available to users.
   Setting a force-update floor above the newest published build locks every
   user out of the app with no way forward.
5. Touch the Convex force-update record only when the user explicitly asks, and
   only through the deployment they named. Dev first, prod as a separate,
   explicitly confirmed step.
6. Verify the changed files and report the exact commands run.

## Force-Update Record

The force-update table does **not exist yet** in this repository. Do not invent
a function name and do not create the table as a side effect of a version bump.

- Read `convex/schema.ts` and `convex/schema/` first and use whatever the
  schema actually defines.
- If nothing is defined yet, stop and report that the force-update path is not
  implemented. The intended shape — a small `appVersions`-style table holding
  `version`, `shouldUpdate`, and `createdAt`, indexed by `shouldUpdate`, read by
  a query that the client compares against `appVersion` from `config.ts` — is
  documented in `.notes/research/06-martie-convex.md` §2.2 and
  `.notes/research/13-convex-scale.md`. Implementing it is a separate task with
  its own review, not part of a version bump.
- Once it exists, discover the real function names with `bunx convex function-spec`
  rather than guessing, and only then run them.

## Reference

Read `references/workflow.md` for the full version workflow and the related
files.
