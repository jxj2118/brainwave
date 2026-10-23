#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

fail() { printf 'Android: %s\n' "$*" >&2; exit 1; }

check_only=false
case "${1:-}" in
  --check) check_only=true; shift ;;
  --help|-h)
    printf '%s\n' \
      'Usage: bun run android [Tauri dev options]' \
      '       bun run android:check' \
      '' \
      'Connect one Android device, enable USB debugging and authorize this computer.' \
      'JAVA_HOME, ANDROID_HOME (or ANDROID_SDK_ROOT) and NDK_HOME may override discovery.'
    exit 0 ;;
esac

bun_binary="$(command -v bun || true)"
if [[ -z "$bun_binary" && -x "$HOME/.bun/bin/bun" ]]; then
  bun_binary="$HOME/.bun/bin/bun"
fi
[[ -n "$bun_binary" ]] || fail 'Bun not found. Install Bun and reopen your terminal.'

# Fail before Tauri takes its Android build lock or starts another Vite server.
"$bun_binary" scripts/check-dev-ports.ts

source scripts/android-env.sh
android_setup_environment
adb_binary="$ANDROID_HOME/platform-tools/adb"
[[ -x "$adb_binary" ]] || fail 'Android SDK/platform-tools/adb not found.'
export PATH="$(dirname "$bun_binary"):$PATH"

# Validate the same device set Tauri will enumerate. Never silently pick one of
# several phones, or run a second server against an arbitrary connected device.
device_listing="$("$adb_binary" devices)"
devices=()
while IFS= read -r device_serial; do
  [[ -z "$device_serial" ]] || devices+=("$device_serial")
done < <(printf '%s\n' "$device_listing" | awk 'NR > 1 && $2 == "device" { print $1 }')
(( ${#devices[@]} > 0 )) || fail 'No authorized device found. Enable USB debugging, unlock the phone and accept its authorization prompt.'
if (( ${#devices[@]} > 1 )); then
  printf '%s\n' "$device_listing" >&2
  fail 'Multiple devices are connected. Disconnect the others or stop extra emulators before running this USB launcher.'
fi
device_serial="${devices[0]}"
printf 'Java: %s\nSDK: %s\nNDK: %s\nDevice: %s\n' "$JAVA_HOME" "$ANDROID_HOME" "$NDK_HOME" "$device_serial"
if "$check_only"; then
  printf '%s\n' 'Android environment ready. Run: bun run android'
  exit 0
fi

"$adb_binary" -s "$device_serial" reverse tcp:1420 tcp:1420
"$adb_binary" -s "$device_serial" reverse tcp:1421 tcp:1421
printf '%s\n' 'Starting Android over USB. Keep this terminal open; Ctrl+C stops development.'
exec "$bun_binary" run tauri android dev --host 127.0.0.1 "$@"
