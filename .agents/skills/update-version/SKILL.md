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
3. Inspect native compatibility before building or publishing. Current delivery
   uses Codemagic Patch: package.json version targets a binary marketing version,
   and the generated native fingerprint must match. app.config.ts no longer owns
   an expo-updates runtimeVersion. Native dependencies/plugins/permissions or
   native contract changes require new compatible binaries before their OTA.
   Do not bump the marketing version for each compatible JS/assets change.
   Store binaries <=1.4.0 use the former expo-updates path; the first Patch binary
   is 1.5.0. Inspect actual public binaries and follow `$release-update`.
   `config.ts` exports installed native version using expo-application, with
   a manifest fallback only for web/Expo Go.
4. For `--force`, warn that the store version must already be available to users.
   Setting a force-update floor above the newest published build locks every
   user out of the app with no way forward.
5. Touch the Convex force-update record only when the user explicitly asks, and
   only through the deployment they named. Dev first, prod as a separate,
   explicitly confirmed step.
6. Verify the changed files and report the exact commands run.

## Force-Update Record

The existing singleton `appConfig` is the only owner. Read
`convex/schema/appContent.ts`, `convex/app/mutations.ts` (`upsertConfig`),
`convex/app/queries.ts` (`config`) and `src/features/runtime/boot.tsx`.
The gate compares installed native build numbers against
`minSupportedIosBuild` / `minSupportedAndroidBuild`; `latestIosVersion` /
`latestAndroidVersion` are marketing versions, not the enforced floors.
Do not create a second `appVersions` table.

`upsertConfig` requires an authenticated app ADMIN and **replaces the complete
singleton**. Follow the read/merge/readback procedure in
`references/workflow.md`; preserve maintenance, URLs, optional message key and
all feature flags. A routine version bump never raises a floor. Changing a
floor remains a separate owner decision under AGENTS.md.

## Reference

Read `references/workflow.md` for the full version workflow and the related
files.
