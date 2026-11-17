#!/bin/zsh

set -euo pipefail

platform="${1:-}"
if [[ "$platform" != "ios" && "$platform" != "android" && "$platform" != "all" ]]; then
  print -u2 "usage: $0 <ios|android|all>"
  exit 64
fi

if [[ "${EAS_UPDATE_CONFIRM_COMPATIBLE:-}" != "1" ]]; then
  print -u2 \
    "set EAS_UPDATE_CONFIRM_COMPATIBLE=1 only after confirming the change is JavaScript/assets-only"
  exit 64
fi

update_message="${EAS_UPDATE_MESSAGE:-}"
if [[ -z "$update_message" ]]; then
  print -u2 "set EAS_UPDATE_MESSAGE to a short, user-facing description"
  exit 64
fi

script_dir="${0:A:h}"
repo_root="${script_dir:h}"
cd "$repo_root"

current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "main" ]]; then
  print -u2 "production EAS Update must run from main, not $current_branch"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  print -u2 "production EAS Update requires a clean worktree"
  exit 1
fi

git fetch --quiet origin main
local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse origin/main)"
if [[ "$local_head" != "$remote_head" ]]; then
  print -u2 "production EAS Update requires HEAD to match origin/main"
  exit 1
fi

verify_mode="${EAS_UPDATE_VERIFY:-ci}"
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
    print -u2 "production EAS Update requires successful CI for exact main@$local_head"
    exit 1
  fi
elif [[ "$verify_mode" == "local" ]]; then
  # For when GitHub Actions cannot run (its included minutes are used up).
  # This runs the commands of CI's `check` job on this exact clean commit. The
  # Convex budget suite and the history secret scan stay CI-only, which is why
  # this mode is only for the JavaScript/assets-only updates that
  # EAS_UPDATE_CONFIRM_COMPATIBLE already attests to.
  print "Verifying main@$local_head locally: lint:all, typecheck, test"
  bun lint:all
  bun typecheck
  bun run test --silent
else
  print -u2 "EAS_UPDATE_VERIFY must be ci (default) or local, not $verify_mode"
  exit 64
fi

if [[ "${EAS_UPDATE_DRY_RUN:-}" == "1" ]]; then
  print "Verified BooKoo $platform OTA release gates for main@$local_head"
  exit 0
fi

print "Publishing BooKoo $platform OTA from main@$local_head"
exec env \
  NODE_ENV=production \
  STAGE=production \
  BOOKOO_APP_VARIANT=production \
  EXPO_NO_DOTENV=1 \
  bunx eas-cli@23.0.0 update \
  --channel production \
  --environment production \
  --message "$update_message" \
  --platform "$platform" \
  --non-interactive
