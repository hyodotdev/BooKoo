#!/bin/zsh

set -euo pipefail

profile="${1:-}"
if [[ "$profile" != "preview" && "$profile" != "production" ]]; then
  print -u2 "usage: $0 <preview|production> [eas build arguments]"
  exit 64
fi
shift

build_args=("$@")
output_path=""
for (( argument_index = 1; argument_index <= ${#build_args[@]}; argument_index++ )); do
  case "${build_args[$argument_index]}" in
    --output|-o)
      (( argument_index++ ))
      output_path="${build_args[$argument_index]:-}"
      ;;
    --output=*)
      output_path="${build_args[$argument_index]#--output=}"
      ;;
  esac
done
if [[ -z "$output_path" ]]; then
  output_path="$PWD/bookoo-$profile-ios.ipa"
  build_args+=(--output "$output_path")
fi
output_path="${output_path:A}"

# Failed EAS runs can leak temporary keychains into the persistent user search
# list. Keep real user keychains, drop only EAS build temporaries, and restore
# that clean list even when the build exits unsuccessfully.
original_keychains=("${(@f)$(security list-keychains -d user | sed -E 's/^[[:space:]]*"([^"]+)"$/\1/')}" )
clean_keychains=()
for keychain in "${original_keychains[@]}"; do
  if [[ "$keychain" != */eas-build-*.keychain ]]; then
    clean_keychains+=("$keychain")
  fi
done
if (( ${#clean_keychains[@]} == 0 )); then
  print -u2 "no persistent user keychain is available"
  exit 1
fi

build_started_marker="$(mktemp /private/tmp/bookoo-eas-build.XXXXXX)"

restore_keychains() {
  security list-keychains -d user -s "${clean_keychains[@]}" >/dev/null
  rm -f "$build_started_marker"
}
trap restore_keychains EXIT INT TERM
security list-keychains -d user -s "${clean_keychains[@]}"

# EAS imports a legacy-named `iPhone Distribution` identity. Xcode 26 can
# otherwise pick an unrelated global `Apple Distribution` certificate and
# report that a matching profile does not contain the selected certificate.
set +e
env \
  LANG=en_US.UTF-8 \
  LC_ALL=en_US.UTF-8 \
  NODE_ENV=production \
  XCODE_XCCONFIG_FILE="$PWD/scripts/ios-local-signing.xcconfig" \
  bunx eas-cli@23.0.0 build \
  --profile "$profile" \
  --platform ios \
  --local \
  "${build_args[@]}"
eas_status=$?
set -e

if (( eas_status == 0 )); then
  exit 0
fi

# Xcode 26 can ignore CODE_SIGN_IDENTITY during export and pick an unrelated
# Apple Distribution identity from login.keychain. EAS still leaves a valid
# signed archive in Xcode Archives. Re-export that archive with the exact
# certificate fingerprint and profile from the gitignored local credentials.
if [[ "$profile" != "production" || ! -f "$PWD/credentials.json" ]]; then
  exit "$eas_status"
fi

user_home="$(dscl . -read "/Users/$(id -un)" NFSHomeDirectory | awk '{print $2}')"
archive_root="$user_home/Library/Developer/Xcode/Archives"
archives=()
while IFS= read -r -d $'\0' archive; do
  archives+=("$archive")
done < <(find "$archive_root" -type d -name '*.xcarchive' -newer "$build_started_marker" -print0)

if (( ${#archives[@]} == 0 )); then
  print -u2 "EAS failed before creating an archive; manual export is unavailable"
  exit "$eas_status"
fi

latest_archive="${archives[1]}"
for archive in "${archives[@]}"; do
  if [[ "$archive" -nt "$latest_archive" ]]; then
    latest_archive="$archive"
  fi
done

print -u2 "EAS export failed; retrying the signed archive with the matching local identity"
"$PWD/scripts/export-ios-archive.zsh" \
  "$latest_archive" \
  "$PWD/credentials.json" \
  "$output_path"
