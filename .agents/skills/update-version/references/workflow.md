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

Codemagic Patch targets each OTA release at the marketing version in
`package.json` and also compares the native fingerprint. If the release changes
native dependencies, plugins, permissions, entitlements or the native contract,
ship both new iOS and Android binaries before OTA delivery. An OTA requiring
those native APIs must never target older binaries.

For a metadata-only patch with an unchanged native contract, explicitly retain
the compatible runtime and record the decision in release evidence. Historical
iOS1.1.1 retained runtime1.1.0 to support live Android32/iOS41 through the guarded
OTA workflow. That title change did not include an OTA.
Inspect the resolved configuration and embedded runtime in each new archive.

Native build numbers (iOS `buildNumber`, Android `versionCode`) are not managed
here. EAS auto-increments them; see `$release-update`.

### Step 2 — (only with `--force`) Convex force-update record

**Precondition:** the target version must already be live in both stores. A
force-update floor above the newest published build bricks every install.

1. Confirm the table and functions exist:

   ```bash
   grep -rn "appVersion" convex/schema.ts convex/schema/ 2>/dev/null
   bunx convex function-spec | grep -i version
   ```

2. If they do not exist, stop. Report that force update is not implemented and
   point at the intended shape in `.notes/research/06-martie-convex.md` §2.2
   (an `appVersions`-style table: `version: v.string()`,
   `shouldUpdate: v.boolean()`, `createdAt: v.number()`, indexed by
   `shouldUpdate`). Do not create the table as a side effect of a version bump.

3. If they do exist, push the functions and run the real mutation name from the
   function spec against the dev deployment first:

   ```bash
   bun dev:convex:once
   bunx convex run <module>:<mutation> '{"version": "<version>", "shouldUpdate": true}'
   ```

4. Production is a separate, explicitly confirmed step. Never fold it into the
   dev command:

   ```bash
   bunx convex deploy
   bunx convex run --prod <module>:<mutation> '{"version": "<version>", "shouldUpdate": true}'
   ```

5. Verify by reading the record back before reporting success.

### Step 3 — Report

State the old and new version, the files changed, whether a force-update record
was written, and to which deployment. If `--force` was requested but the record
was not written, say so explicitly and why.

## Related Files

| File                                  | Role                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `package.json`                        | Sole marketing/store version source (`version` field)                                       |
| `app.config.ts`                       | Consumes marketing version; owns native compatibility runtime and store ids                 |
| `config.ts`                           | Exports installed native appVersion (manifest fallback only on web/Expo Go) and Convex URLs |
| `convex/schema.ts`, `convex/schema/`  | Where the force-update table will be declared                                               |
| `.notes/research/06-martie-convex.md` | Reference shape for the `appVersions` table                                                 |
| `.notes/research/13-convex-scale.md`  | Index and query rules any new table must satisfy                                            |

## Cautions

- A force update is irreversible from the user's side. Verify store availability
  on both platforms before setting it.
- Bumping the version does not release anything. Use `$release-update` for the
  build, submit, and rollout.
- Commit the bump through `$commit` as `chore(release): bump version to <x.y.z>`.
