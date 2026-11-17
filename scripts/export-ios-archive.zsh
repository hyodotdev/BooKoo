#!/bin/zsh

set -euo pipefail

archive_path="${1:-}"
credentials_json="${2:-}"
output_path="${3:-}"

if [[ -z "$archive_path" || -z "$credentials_json" || -z "$output_path" ]]; then
  print -u2 "usage: $0 <archive.xcarchive> <credentials.json> <output.ipa>"
  exit 64
fi

archive_path="${archive_path:A}"
credentials_json="${credentials_json:A}"
output_path="${output_path:A}"

if [[ ! -d "$archive_path" || "${archive_path:e}" != "xcarchive" ]]; then
  print -u2 "archive does not exist: $archive_path"
  exit 66
fi
if [[ ! -f "$credentials_json" ]]; then
  print -u2 "credentials file does not exist: $credentials_json"
  exit 66
fi

project_root="$PWD"
certificate_path="$(jq -r '.ios.distributionCertificate.path' "$credentials_json")"
certificate_password="$(jq -r '.ios.distributionCertificate.password' "$credentials_json")"
profile_path="$(jq -r '.ios.provisioningProfilePath' "$credentials_json")"
[[ "$certificate_path" == /* ]] || certificate_path="$project_root/$certificate_path"
[[ "$profile_path" == /* ]] || profile_path="$project_root/$profile_path"

if [[ ! -f "$certificate_path" || ! -f "$profile_path" ]]; then
  print -u2 "credentials.json points to a missing certificate or profile"
  exit 66
fi

app_path="$(find "$archive_path/Products/Applications" -maxdepth 1 -type d -name '*.app' -print -quit)"
if [[ -z "$app_path" ]]; then
  print -u2 "archive does not contain an application"
  exit 65
fi
bundle_id="$(plutil -extract CFBundleIdentifier raw "$app_path/Info.plist")"

task_dir="$(mktemp -d /private/tmp/bookoo-ios-export.XXXXXX)"
keychain_path="$task_dir/export.keychain-db"
keychain_password="$(openssl rand -hex 24)"
profile_plist="$task_dir/profile.plist"
profile_certificate="$task_dir/profile-certificate.der"
export_options="$task_dir/ExportOptions.plist"
export_dir="$task_dir/export"

original_keychains=("${(@f)$(security list-keychains -d user | sed -E 's/^[[:space:]]*"([^"]+)"$/\1/')}" )
original_default_keychain="$(security default-keychain -d user | sed -E 's/^[[:space:]]*"([^"]+)"$/\1/')"
installed_profile=""
profile_backup=""

cleanup() {
  security list-keychains -d user -s "${original_keychains[@]}" >/dev/null 2>&1 || true
  security default-keychain -d user -s "$original_default_keychain" >/dev/null 2>&1 || true
  if [[ -n "$installed_profile" ]]; then
    if [[ -n "$profile_backup" && -f "$profile_backup" ]]; then
      cp "$profile_backup" "$installed_profile"
    else
      rm -f "$installed_profile"
    fi
  fi
  security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
  rm -rf "$task_dir"
}
trap cleanup EXIT INT TERM

openssl smime -verify -noverify -inform DER -in "$profile_path" -out "$profile_plist" >/dev/null
profile_uuid="$(plutil -extract UUID raw "$profile_plist")"
profile_name="$(plutil -extract Name raw "$profile_plist")"
team_id="$(plutil -extract TeamIdentifier.0 raw "$profile_plist")"
profile_app_id="$(plutil -extract Entitlements.application-identifier raw "$profile_plist")"
if [[ "$profile_app_id" != "$team_id.$bundle_id" ]]; then
  print -u2 "profile application identifier does not match $bundle_id"
  exit 65
fi

plutil -extract DeveloperCertificates.0 raw "$profile_plist" | base64 -D > "$profile_certificate"
profile_fingerprint="$(openssl x509 -inform DER -in "$profile_certificate" -noout -fingerprint -sha1 | cut -d= -f2 | tr -d :)"

security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 21600 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"
security import "$certificate_path" -k "$keychain_path" -P "$certificate_password" -A -t priv -f pkcs12 >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain_path" >/dev/null

identity_fingerprint="$(security find-identity -v -p codesigning "$keychain_path" | awk 'NR == 1 {print $2}')"
if [[ "$identity_fingerprint" != "$profile_fingerprint" ]]; then
  print -u2 "distribution identity does not match the provisioning profile"
  exit 65
fi

user_home="$(dscl . -read "/Users/$(id -un)" NFSHomeDirectory | awk '{print $2}')"
profile_directory="$user_home/Library/MobileDevice/Provisioning Profiles"
installed_profile="$profile_directory/$profile_uuid.mobileprovision"
mkdir -p "$profile_directory"
if [[ -f "$installed_profile" ]]; then
  profile_backup="$task_dir/original.mobileprovision"
  cp "$installed_profile" "$profile_backup"
fi
cp "$profile_path" "$installed_profile"

cat > "$export_options" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>destination</key>
  <string>export</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>method</key>
  <string>app-store-connect</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>$bundle_id</key>
    <string>$profile_uuid</string>
  </dict>
  <key>signingCertificate</key>
  <string>$identity_fingerprint</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>teamID</key>
  <string>$team_id</string>
</dict>
</plist>
PLIST

security list-keychains -d user -s "$keychain_path"
security default-keychain -d user -s "$keychain_path"
mkdir -p "$export_dir" "${output_path:h}"

print "Exporting $bundle_id with profile $profile_name ($profile_uuid)"
xcodebuild \
  -exportArchive \
  -archivePath "$archive_path" \
  -exportPath "$export_dir" \
  -exportOptionsPlist "$export_options" \
  "OTHER_CODE_SIGN_FLAGS=--keychain $keychain_path"

exported_ipa="$(find "$export_dir" -maxdepth 1 -type f -name '*.ipa' -print -quit)"
if [[ -z "$exported_ipa" ]]; then
  print -u2 "xcodebuild did not create an IPA"
  exit 65
fi
cp "$exported_ipa" "$output_path"
print "Exported IPA: $output_path"
