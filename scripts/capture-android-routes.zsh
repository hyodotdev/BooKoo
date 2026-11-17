#!/bin/zsh
set -euo pipefail

if (( $# < 2 )); then
  print -u2 'usage: capture-android-routes.zsh <device-serial> <output-directory>'
  exit 64
fi

BOOKOO_DEVICE_SERIAL="$1"
BOOKOO_CAPTURE_DIR="$2"
BOOKOO_PACKAGE="$(bun -e 'import app from "./shared/application.json"; process.stdout.write(app.qaApplicationId)')"

mkdir -p "$BOOKOO_CAPTURE_DIR"
adb -s "$BOOKOO_DEVICE_SERIAL" shell logcat -c

typeset -a BOOKOO_ROUTE_NAMES=(
  settings-home
  appearance
  language
  currency
  notifications
  account
  about
  faq
  announcements
  privacy
  diagnostics
  operations
  profile
  calendar
)

typeset -a BOOKOO_ROUTE_URLS=(
  'bookoo-qa://settings'
  'bookoo-qa://settings/appearance'
  'bookoo-qa://settings/language'
  'bookoo-qa://settings/default-currency'
  'bookoo-qa://settings/notifications'
  'bookoo-qa://settings/account'
  'bookoo-qa://settings/about'
  'bookoo-qa://settings/faq'
  'bookoo-qa://settings/announcements'
  'bookoo-qa://settings/privacy'
  'bookoo-qa://settings/diagnostics'
  'bookoo-qa://settings/ops'
  'bookoo-qa://profile/me'
  'bookoo-qa://'
)

for BOOKOO_ROUTE_INDEX in {1..${#BOOKOO_ROUTE_NAMES}}; do
  BOOKOO_ROUTE_NAME="${BOOKOO_ROUTE_NAMES[$BOOKOO_ROUTE_INDEX]}"
  BOOKOO_ROUTE_URL="${BOOKOO_ROUTE_URLS[$BOOKOO_ROUTE_INDEX]}"
  adb -s "$BOOKOO_DEVICE_SERIAL" shell am start -W \
    -a android.intent.action.VIEW \
    -d "$BOOKOO_ROUTE_URL" \
    "$BOOKOO_PACKAGE" >/dev/null
  sleep 1
  adb -s "$BOOKOO_DEVICE_SERIAL" exec-out screencap -p \
    > "$BOOKOO_CAPTURE_DIR/${BOOKOO_ROUTE_INDEX}-${BOOKOO_ROUTE_NAME}.png"
done

adb -s "$BOOKOO_DEVICE_SERIAL" shell dumpsys activity activities \
  > "$BOOKOO_CAPTURE_DIR/activity.txt"
adb -s "$BOOKOO_DEVICE_SERIAL" shell logcat -d -t 2400 \
  > "$BOOKOO_CAPTURE_DIR/logcat.txt"

if rg -i \
  'FATAL EXCEPTION|ANR in|ReactNative.*Exception|ErrorBoundary|SurfaceMountingManager.*Unhandled|addViewAt:|ReactHost.*Destroy' \
  "$BOOKOO_CAPTURE_DIR/logcat.txt" \
  > "$BOOKOO_CAPTURE_DIR/failures.txt"; then
  print -u2 "runtime failure signature detected; inspect $BOOKOO_CAPTURE_DIR/failures.txt"
  exit 1
fi

if ! rg -q "ResumedActivity:.*${BOOKOO_PACKAGE//./\\.}/" \
  "$BOOKOO_CAPTURE_DIR/activity.txt"; then
  print -u2 'BooKoo is not the resumed foreground activity after the route sweep'
  exit 1
fi

print "captured ${#BOOKOO_ROUTE_NAMES} routes in $BOOKOO_CAPTURE_DIR"
