#!/bin/zsh

set -euo pipefail

platform="${1:-}"
if [[ "$platform" != "ios" && "$platform" != "android" && "$platform" != "all" ]]; then
  print -u2 "usage: $0 <ios|android|all>"
  exit 64
fi

if [[ "${OTA_CONFIRM_COMPATIBLE:-}" != "1" ]]; then
  print -u2 \
    "set OTA_CONFIRM_COMPATIBLE=1 only after confirming the change is JavaScript/assets-only"
  exit 64
fi

update_message="${OTA_MESSAGE:-}"
if [[ -z "$update_message" ]]; then
  print -u2 "set OTA_MESSAGE to a short, user-facing description"
  exit 64
fi

script_dir="${0:A:h}"
repo_root="${script_dir:h}"
cd "$repo_root"

if [[ -n "$(git status --porcelain)" ]]; then
  print -u2 "production OTA requires a clean worktree"
  exit 1
fi

# An explicit refspec: a CI clone of a tag may have no remote-tracking branches,
# and a bare `fetch origin main` then updates only FETCH_HEAD. A shallow clone
# also cannot prove ancestry, so it is unshallowed first.
main_ref=+refs/heads/main:refs/remotes/origin/main
if [[ "$(git rev-parse --is-shallow-repository)" == true ]]; then
  git fetch --quiet --unshallow origin "$main_ref"
else
  git fetch --quiet origin "$main_ref"
fi
local_head="$(git rev-parse HEAD)"

if [[ -n "${CM_BUILD_ID:-}" ]]; then
  # Codemagic checks out the pushed `ota-*` tag. It must point into main; main
  # may have moved on while the build queued. GitHub CI is not queried from
  # there, so its check commands run on this commit below.
  if ! git merge-base --is-ancestor "$local_head" origin/main; then
    print -u2 "production OTA requires a commit on main, not $local_head"
    exit 1
  fi
  verify_mode=local
else
  current_branch="$(git branch --show-current)"
  if [[ "$current_branch" != "main" ]]; then
    print -u2 "production OTA must run from main, not $current_branch"
    exit 1
  fi
  remote_head="$(git rev-parse origin/main)"
  if [[ "$local_head" != "$remote_head" ]]; then
    print -u2 "production OTA requires HEAD to match origin/main"
    exit 1
  fi
  verify_mode="${OTA_VERIFY:-ci}"
fi

if [[ "$verify_mode" == "ci" ]]; then
  ci_state="$(
    gh run list \
      --workflow CI \
      --commit "$local_head" \
      --event push \
      --limit 1 \
      --json headSha,status,conclusion \
      --jq 'if length == 1 then "\(.[0].headSha):\(.[0].status):\(.[0].conclusion)" else "" end'
  )"
  if [[ "$ci_state" != "${local_head}:completed:success" ]]; then
    print -u2 "production OTA requires successful CI for exact main@$local_head"
    exit 1
  fi
elif [[ "$verify_mode" == "local" ]]; then
  # For when GitHub Actions cannot run (its included minutes are used up).
  # This runs the commands of CI's `check` job on this exact clean commit. The
  # Convex budget suite and the history secret scan stay CI-only, which is why
  # this mode is only for the JavaScript/assets-only updates that
  # OTA_CONFIRM_COMPATIBLE already attests to.
  print "Verifying main@$local_head locally: lint:all, typecheck, test"
  bun lint:all
  bun typecheck
  bun run test --silent
else
  print -u2 "OTA_VERIFY must be ci (default) or local, not $verify_mode"
  exit 64
fi

# A dry run still regenerates the native projects and builds the bundle; only
# the upload is skipped (`release-react --dry-run`).
dry_run=()
[[ "${OTA_DRY_RUN:-}" == "1" ]] && dry_run=(--dry-run)

version="$(bun -e 'process.stdout.write(require("./package.json").version)')"
case "$platform" in
  ios) targets=(ios) ;;
  android) targets=(android) ;;
  all) targets=(ios android) ;;
esac

for target in $targets; do
  app_name="BooKoo-iOS"
  [[ "$target" == "android" ]] && app_name="BooKoo-Android"
  print "Publishing BooKoo $target OTA $version from $local_head${dry_run:+ (dry run)}"
  # The native projects are generated (CNG). Patch fingerprints them and
  # refuses a release whose fingerprint differs from earlier releases for the
  # same binary version, so they are regenerated from this commit, with the
  # store builds' production identity, before every release. `--clean`
  # replaces any local ios/ and android/ folders.
  prebuild=(bunx expo prebuild --no-install --clean --platform "$target")
  release=(
    bunx @codemagic/patch-cli@0.10.0 release-react
    --server-url https://ota.codemagicpatch.dev
    --app "$app_name"
    --deployment Production
    --platform "$target"
    --target-binary-version "$version"
    --release-notes "$update_message"
    --non-interactive --yes
    $dry_run
  )
  # EAS stays the source of the production environment: `env:exec` injects the
  # same EXPO_PUBLIC_* values the store builds were compiled with. Each word is
  # quoted because env:exec runs the string through a shell.
  production_env="NODE_ENV=production STAGE=production BOOKOO_APP_VARIANT=production EXPO_NO_DOTENV=1"
  bunx eas-cli@23.0.0 env:exec production --non-interactive \
    "$production_env ${(j: :)${(@q)prebuild}} && $production_env ${(j: :)${(@q)release}}"
done
