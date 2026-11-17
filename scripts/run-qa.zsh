#!/bin/zsh
set -euo pipefail

platform="${1:-}"
if [[ "$platform" != "ios" && "$platform" != "android" ]]; then
  print -u2 'usage: run-qa.zsh <ios|android> [expo run options]'
  exit 64
fi
shift
repo_root="${0:A:h:h}"
cd "$repo_root"
export BOOKOO_APP_VARIANT=qa

# expo run skips prebuild when native directories already exist. Always sync
# the QA identity first so a cached production project cannot be installed.
bunx expo prebuild --no-install --platform "$platform"
qa_id="$(bun -e 'import app from "./shared/application.json"; process.stdout.write(app.qaApplicationId)')"
store_id="$(bun -e 'import app from "./shared/application.json"; process.stdout.write(app.applicationId)')"
if [[ "$platform" == "android" ]]; then
  if ! rg -Fq "applicationId '$qa_id'" android/app/build.gradle && \
     ! rg -Fq "applicationId \"$qa_id\"" android/app/build.gradle; then
    print -u2 'QA build refused: generated Android applicationId is not the QA id'
    exit 1
  fi
  if rg -Fq "applicationId '$store_id'" android/app/build.gradle || \
     rg -Fq "applicationId \"$store_id\"" android/app/build.gradle; then
    print -u2 'QA build refused: generated Android project still contains a store applicationId'
    exit 1
  fi
else
  if ! rg -Fq "PRODUCT_BUNDLE_IDENTIFIER = $qa_id;" ios/*.xcodeproj/project.pbxproj; then
    print -u2 'QA build refused: generated iOS project does not contain the QA id'
    exit 1
  fi
  if rg -Fq "PRODUCT_BUNDLE_IDENTIFIER = $store_id;" ios/*.xcodeproj/project.pbxproj; then
    print -u2 'QA build refused: generated iOS project still contains a store bundle id'
    exit 1
  fi
fi
exec bunx expo "run:$platform" "$@"
