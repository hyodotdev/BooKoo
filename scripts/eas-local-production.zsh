#!/bin/zsh

set -euo pipefail

platform="${1:-}"
if [[ "$platform" != "ios" && "$platform" != "android" ]]; then
  print -u2 "usage: $0 <ios|android> [eas build arguments]"
  exit 64
fi
shift

if [[ "$platform" == "android" ]]; then
  exec env NODE_ENV=production bunx eas-cli@23.0.0 build \
    --profile production \
    --platform android \
    --local \
    "$@"
fi

exec "$PWD/scripts/eas-local-ios.zsh" production "$@"
