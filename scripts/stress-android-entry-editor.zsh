#!/bin/zsh
set -euo pipefail

if (( $# < 2 )); then
  print -u2 'usage: stress-android-entry-editor.zsh <device-serial> <output-directory>'
  exit 64
fi

BOOKOO_DEVICE_SERIAL="$1"
BOOKOO_STRESS_DIR="$2"
BOOKOO_PACKAGE="$(bun -e 'import app from "./shared/application.json"; process.stdout.write(app.qaApplicationId)')"
BOOKOO_UI_XML="$(mktemp -t bookoo-uia)"

mkdir -p "$BOOKOO_STRESS_DIR"

dump_ui() {
  adb -s "$BOOKOO_DEVICE_SERIAL" shell uiautomator dump /sdcard/bookoo-uia.xml \
    >/dev/null
  adb -s "$BOOKOO_DEVICE_SERIAL" pull /sdcard/bookoo-uia.xml "$BOOKOO_UI_XML" \
    >/dev/null
}

node_for_id() {
  dump_ui
  sed 's#><#>\
<#g' "$BOOKOO_UI_XML" | rg -m1 "resource-id=\"$1\""
}

node_for_text() {
  dump_ui
  sed 's#><#>\
<#g' "$BOOKOO_UI_XML" | rg -m1 "text=\"$1\""
}

node_for_edit_desc() {
  dump_ui
  sed 's#><#>\
<#g' "$BOOKOO_UI_XML" | rg 'class="android.widget.EditText"' | \
    rg -m1 "content-desc=\"$1\""
}

tap_node() {
  BOOKOO_NODE="$1"
  BOOKOO_BOUNDS="$(print -r -- "$BOOKOO_NODE" | sed -E \
    's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/')"
  read BOOKOO_X1 BOOKOO_Y1 BOOKOO_X2 BOOKOO_Y2 <<< "$BOOKOO_BOUNDS"
  BOOKOO_TAP_X=$(((BOOKOO_X1 + BOOKOO_X2) / 2))
  BOOKOO_TAP_Y=$(((BOOKOO_Y1 + BOOKOO_Y2) / 2))
  adb -s "$BOOKOO_DEVICE_SERIAL" shell input tap \
    "$BOOKOO_TAP_X" "$BOOKOO_TAP_Y"
}

tap_id() {
  tap_node "$(node_for_id "$1")"
  sleep 1
}

tap_text() {
  tap_node "$(node_for_text "$1")"
  sleep 1
}

assert_id() {
  node_for_id "$1" >/dev/null
}

capture() {
  adb -s "$BOOKOO_DEVICE_SERIAL" exec-out screencap -p > "$BOOKOO_STRESS_DIR/$1.png"
}

adb -s "$BOOKOO_DEVICE_SERIAL" shell logcat -c
adb -s "$BOOKOO_DEVICE_SERIAL" shell am start -W \
  -a android.intent.action.VIEW -d 'bookoo-qa://' "$BOOKOO_PACKAGE" >/dev/null
sleep 2

assert_id calendar-parallax-add
tap_id calendar-parallax-add
assert_id entry-route-header
assert_id entry-amount-input
assert_id entry-category-picker
assert_id entry-date-picker
assert_id entry-location-picker
capture 001-create-page

for BOOKOO_DATE_CYCLE in {1..8}; do
  tap_id entry-date-picker
  adb -s "$BOOKOO_DEVICE_SERIAL" shell input keyevent KEYCODE_BACK
  sleep 1
  assert_id entry-route-header
done
capture 002-after-date-cycles

tap_id entry-category-picker
assert_id entry-create-category
capture 003-category-sheet
adb -s "$BOOKOO_DEVICE_SERIAL" shell input keyevent KEYCODE_BACK
sleep 1
assert_id entry-route-header

adb -s "$BOOKOO_DEVICE_SERIAL" shell input swipe 540 1840 540 820 350
sleep 1
tap_node "$(node_for_edit_desc '메모')"
adb -s "$BOOKOO_DEVICE_SERIAL" shell input text 'Next%sstudy%smaterials'
sleep 1
capture 004-memo-keyboard
adb -s "$BOOKOO_DEVICE_SERIAL" shell input keyevent KEYCODE_BACK
sleep 1

tap_id entry-location-picker
assert_id entry-location-map
capture 005-location-map
tap_text 완료

for BOOKOO_RETURN_WAIT in {1..20}; do
  if node_for_id entry-route-header >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
assert_id entry-route-header
capture 006-location-returned

adb -s "$BOOKOO_DEVICE_SERIAL" shell input keyevent KEYCODE_BACK
sleep 1
assert_id calendar-parallax-add

for BOOKOO_EDITOR_CYCLE in {1..12}; do
  tap_id calendar-parallax-add
  assert_id entry-route-header
  adb -s "$BOOKOO_DEVICE_SERIAL" shell input keyevent KEYCODE_BACK
  sleep 1
  assert_id calendar-parallax-add
done

for BOOKOO_RESUME_CYCLE in {1..10}; do
  adb -s "$BOOKOO_DEVICE_SERIAL" shell input keyevent KEYCODE_HOME
  adb -s "$BOOKOO_DEVICE_SERIAL" shell am start -W \
    -n "$BOOKOO_PACKAGE/.MainActivity" >/dev/null
  sleep 1
  assert_id calendar-parallax-add
done

capture 007-stress-final
adb -s "$BOOKOO_DEVICE_SERIAL" shell dumpsys activity activities \
  > "$BOOKOO_STRESS_DIR/activity.txt"
adb -s "$BOOKOO_DEVICE_SERIAL" shell logcat -d -t 4000 \
  > "$BOOKOO_STRESS_DIR/logcat.txt"

if rg -i \
  'FATAL EXCEPTION|ANR in|ReactNative.*Exception|ErrorBoundary|SurfaceMountingManager.*Unhandled|addViewAt:|ReactHost.*Destroy' \
  "$BOOKOO_STRESS_DIR/logcat.txt" > "$BOOKOO_STRESS_DIR/failures.txt"; then
  print -u2 "runtime failure signature detected; inspect $BOOKOO_STRESS_DIR/failures.txt"
  exit 1
fi

if ! rg -q 'ResumedActivity:.*dev\.hyo\.bookoo/.MainActivity' \
  "$BOOKOO_STRESS_DIR/activity.txt"; then
  print -u2 'BooKoo is not foreground after the stress test'
  exit 1
fi

print "LedgerItem editor stress passed on $BOOKOO_DEVICE_SERIAL"
