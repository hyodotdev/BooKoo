---
name: release-update
description: Build, verify, submit, and publish BooKoo releases through local EAS Build, Codemagic Patch OTA, Google Play, and App Store Connect. Use when the user runs `/release-update` or `$release-update`, asks to release or deploy BooKoo, upload IPA/AAB artifacts, submit store builds for review, add release notes, choose between a native build and an OTA update, or finish a version rollout after review and E2E.
---

# Release Update

Ship BooKoo only after review, CI, and the requested regression gates are
complete. Report upload, review, approval, and public release as separate
states.

## Establish Release Inputs

1. Read `AGENTS.md`, `package.json` scripts, `eas.json`, `app.config.ts`, the
   current branch/PR, and `$update-version`.
2. Confirm the semantic version, the remote iOS build number, the remote Android
   version code, the target channels/tracks, and the store application
   identifiers. BooKoo ships under `dev.hyo.bookoo` as a **new** store
   listing — it is not an update to the 2017 `com.dooboolab.bookoo` apps, so
   never assume an existing listing, review history, or rollout track.
3. Build release notes from the actual PR diff and user-facing behavior. Keep
   them concise and localized where store metadata requires it — Korean and
   English at minimum, matching `app.config.ts`'s `locales`.
4. Preserve unrelated changes and existing credentials. Never print secrets.

## Deploy The Backend First

The app is useless against a stale backend. Before any client artifact reaches
users:

1. Push and verify Convex functions for the target deployment:
   - `bun dev:convex:once` for dev
   - `bun deploy:convex` for production
2. Confirm every new query the client calls exists in the deployed function
   spec, and that any new index has finished backfilling.
3. A schema change that removes or narrows a field must ship **after** the
   clients that stopped using it, never before.

## Choose Native Build Or OTA

Require new iOS and Android binaries when any of these changed:

- Expo SDK, React Native, native modules, config plugins, entitlements,
  permissions, targets, manifests, Info.plist, Pod/Gradle inputs, or native
  assets — including anything under `plugins/` and the social-login SDKs;
- app version/build numbers or store compliance requirements;
- behavior that cannot run safely on the installed binary version.

Over-the-air updates come from Codemagic Patch (`@codemagic/react-native-patch`,
team OpenIAP on `https://ota.codemagicpatch.dev`, apps `BooKoo-iOS` and
`BooKoo-Android`). A release targets the binary's marketing version and Patch
also checks the native fingerprint, so an OTA never lands on an incompatible
binary. Native-contract changes need new iOS and Android binaries before any
OTA that relies on them; follow `$update-version`. The first Patch binary is
1.5.0; store binaries up to 1.4.0 still run expo-updates and receive nothing
from Patch.

Use a Codemagic Patch OTA only when the change is JavaScript/assets compatible with the
existing production binary and no store binary or compliance update is needed.

## Verify Before Shipping

1. Require `$review-self` and `$review-pr` stability, successful CI, a clean
   worktree, and a mergeable approved target.
2. Run `bun lint:all`, `bun typecheck`, `bun run test`, `bunx expo-doctor`, and
   `git diff --check` when their fingerprints changed. `bun check` covers lint,
   typecheck and tests; `bun lint:all` must still run separately.
3. Run `$perf-audit` and require a clean verdict table. A release is exactly the
   moment the dataset gets bigger; an unpaginated list ships as a bug report.
4. Run `$e2e-test` on both the iOS simulator and the Android emulator. Cover
   cold start, sign-in, ledger entry create, the paginated timeline, the
   calendar, statistics, and the invite deep link. Verify the invite App/
   Universal Link against the **production** domain, since the association file
   is served per environment.
5. For native releases, require successful production EAS builds from the exact
   merged commit:
   - `bun eas:prod:android`
   - `bun eas:prod:ios`
   - `bun eas:preview:android` for an internal-distribution check first
   - or the Codemagic `ios-production` / `android-production` workflows. Push a
     `v<version>` tag on the merged main commit (`git tag v1.6.0 && git push
     origin v1.6.0`); the tag must match `package.json`. They load the `production` EAS environment,
     sign from the secure `bookoo_production` group, fail unless the bundle
     targets the production Convex host (and, on Android, unless the upload key
     signed it), then upload to TestFlight and a Play internal draft. Review
     submission and rollout stay manual.
6. Inspect EAS build metadata and download the artifacts when URLs are
   available. Verify Android is a readable AAB with the expected package and
   version, and iOS is an IPA archive with the expected bundle and version. A
   successful EAS status alone does not replace artifact inspection.

## Merge And Build From The Released Commit

1. Merge only after all required review and regression gates pass and the user
   has authorized merging.
2. Record the merge commit SHA. Build or confirm the submitted artifacts were
   produced from that exact release state; rebuild when the source SHA differs.
3. Do not rewrite history or reuse an older artifact merely because its semantic
   version matches.

## Submit To Stores

1. `package.json` defines local-only native build scripts and guarded production
   update scripts. There are no submit scripts, so use EAS Submit directly:
   - `bunx eas submit --platform android --profile production`
   - `bunx eas submit --platform ios --profile production`
2. Publish an OTA only for a JavaScript/assets-compatible change from a clean
   checkout whose `HEAD` exactly matches `origin/main`. Record that decision and
   a useful message explicitly:
   - `OTA_CONFIRM_COMPATIBLE=1 OTA_MESSAGE="<notes>" bun ota:release`
   - append `:ios` or `:android` to target one platform.
   - or from Codemagic: push an annotated `ota-<label>` tag on the tip of main
     (`git tag -a ota-1.5.0-1 -m "<notes>" && git push origin ota-1.5.0-1`).
     The `ota-production` workflow runs this same script for both platforms with
     `OTA_VERIFY=local`; the tag message is the release note and pushing the tag
     is the compatibility attestation. `ota-dry-<label>` runs every gate
     without publishing.
     The guard publishes to the Patch `Production` deployment, bundling with
     the `production` EAS environment through `eas env:exec`. Never publish
     automatically on every merge: native modules, config plugins, permissions,
     entitlements, and native assets require new locally built binaries even
     when the semantic app version is unchanged.
   - Sign in once with `bunx @codemagic/patch-cli@0.10.0 login --server-url
     https://ota.codemagicpatch.dev`. QA builds read the `Staging` deployment;
     test there first with `cmpatch release-react --deployment Staging`.
   - add `OTA_DRY_RUN=1` to verify the exact-main and successful-CI gates
     without bundling or publishing.
   - when GitHub Actions cannot run, add `OTA_VERIFY=local`: the script
     runs CI's `check` commands (`bun lint:all`, `bun typecheck`, `bun run
     test`) on that exact clean commit instead of looking up the CI run. Never
     use it for a change under `convex/`.
3. Confirm the selected EAS build IDs rather than assuming `--latest` points at
   the intended commit.
4. Report whether an Android upload is draft, in review, staged, or publicly
   available, and which track it targeted.
5. iOS EAS Submit uploads to App Store Connect/TestFlight. Separately attach the
   build to the version metadata, add release notes, complete compliance, and
   submit for App Review. Do not claim App Review submission from an EAS upload
   alone.
6. For a first submission of a new listing, the store metadata — screenshots,
   description, category, privacy answers, data-safety form — must be complete
   before review can be requested. Report exactly which items are missing rather
   than assuming a prior listing covered them.
7. Add release notes before requesting review. Never overwrite unrelated
   localized metadata.
8. If credentials, agreements, compliance answers, 2FA, or a manual product
   choice blocks submission, stop at that exact boundary and preserve the
   completed uploads.

## After The Rollout

- Set a force-update floor only through `$update-version --force`, and only once
  the build is actually available to users in both stores.
- Watch the Convex deployment for function errors and usage spikes over the
  first hours. A pagination regression shows up as a bandwidth or
  documents-scanned spike long before users complain.

## Completion Report

Include:

- version, merge SHA, EAS build IDs, source SHAs, and artifact links;
- Convex deploy result and the deployment targeted;
- AAB/IPA inspection results;
- `$perf-audit` and `$e2e-test` summaries;
- Patch release labels, deployment, and target binary version when OTA was used;
- per-store upload, review, approval, and release states;
- release-note text and any remaining manual action.

Never describe a build as released merely because it built or uploaded.
