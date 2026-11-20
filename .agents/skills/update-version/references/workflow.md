# App Version Update

Bump the app version and, optionally, configure the force-update floor.

## Usage

```
/update-version <version> [--force]
```

**Options:**

- `--force`: also set/activate a force-update record for that version on Convex.

**Examples:**

```bash
# Version only
/update-version 1.7.0

# Version plus force update
/update-version 1.7.0 --force
```

## Procedure

### Step 1 — Bump `package.json`

Edit the marketing/store `version` field to the requested semantic version.
Keep this as the sole marketing version source.

```bash
node -e "console.log(require('./package.json').version)"
```

The version flows outward automatically:

```
package.json .version
  → app.config.ts        (reads package.json for native builds/store metadata)
  → the native binary    (CFBundleShortVersionString / Android versionName)
  → config.ts            (expo-application nativeApplicationVersion)
  → native version consumers
```

Never duplicate the marketing version in a screen. `config.ts` prefers the
installed native version; the update manifest is only a web/Expo Go fallback.

### Step 1b — Review native runtime compatibility

Current OTA delivery uses Codemagic Patch. package.json version is its target
binary marketing version; Patch verifies a fingerprint of the generated native
projects. `app.config.ts` no longer has an expo-updates runtimeVersion. Do not
restore the obsolete runtime-bump procedure. Historical 1.1.1/runtime 1.1.0
explains old expo-updates binaries only; it does not authorize Patch delivery.

Check cumulative native dependency, plugin, permission, entitlement and asset
changes since each platform's actual public binary. Native changes require a
new compatible binary and fresh device/purchase gates before dependent OTA.
Compatible JS/assets changes retain the verified target binary's marketing
version. The first Patch binary is 1.5.0; <=1.4.0 still uses expo-updates.
Inspect the resolved config and archive, not only the version string.

Native build numbers (iOS `buildNumber`, Android `versionCode`) are not managed
here. EAS auto-increments them; Codemagic chooses above store maxima. Reconcile
EAS counters before switching build paths; see `$release-update`.

### Step 2 — (only with `--force`) Convex force-update record

**Precondition:** the target version must already be live in both stores. A
force-update floor above the newest published build bricks every install.

1. Read the existing contract: `convex/schema/appContent.ts` defines
   `appConfig` indexed by `by_singleton`; `convex/app/queries.ts:config` is its
   public projection; `convex/app/mutations.ts:upsertConfig` is the ADMIN-only
   full replacement. The client gate is `src/features/runtime/boot.tsx`.
   Never create `appVersions` or use an invented `shouldUpdate` mutation.
2. Obtain the owner's exact platform/build floor and named deployment. Confirm
   the selected build is publicly obtainable on each affected platform, not
   merely uploaded or in internal testing. Ordinary releases keep floors.
3. Read current `app/queries:config` on that deployment. If absent, do not invent
   initial feature/maintenance values; obtain the missing configuration.
4. Build the complete mutation arguments from the current config and change
   only the approved fields. Preserve both store URLs, marketing versions,
   maintenance mode/message, legacy claim switch and every feature flag.
   Remove read-only `updatedAt`; normalize a null public maintenanceMessageKey
   to an omitted optional argument. `upsertConfig` uses `db.replace`, not patch.
5. Rehearse with the exact schema on isolated local/dev state. Use an authorized
   app ADMIN session for the real mutation; deployment credentials do not grant
   app ADMIN. Re-read immediately before writing and rebuild if anything changed.
   Avoid concurrent configuration writers: this API has no compare-and-swap.
6. Production floors require the separate owner decision. Discover the deployed
   function spec, invoke the actual `app/mutations:upsertConfig` once with that
   full payload, then read `app/queries:config` back. Record sanitized before/
   after values, deployment and affected platform; never expose admin tokens.
   On timeout read back before retrying. Stop if config changed concurrently.

### Step 3 — Report

State the old and new version, the files changed, whether a force-update record
was written, and to which deployment. If `--force` was requested but the record
was not written, say so explicitly and why.

## Related Files

| File                                  | Role                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `package.json`                        | Sole marketing/store version source (`version` field)                                       |
| `app.config.ts`                       | Consumes marketing version; owns native config and store ids                 |
| `config.ts`                           | Exports installed native appVersion (manifest fallback only on web/Expo Go) and Convex URLs |
| `convex/schema.ts`, `convex/schema/`  | Existing appConfig singleton and its indexes                                               |
| `convex/app/mutations.ts`, `convex/app/queries.ts` | ADMIN replacement and public config projection |
| `.notes/research/13-convex-scale.md`  | Index and query rules any new table must satisfy                                            |

## Cautions

- A force update is irreversible from the user's side. Verify store availability
  on both platforms before setting it.
- Bumping the version does not release anything. Use `$release-update` for the
  build, submit, and rollout.
- Commit the bump through `$commit` as `chore(release): bump version to <x.y.z>`.
