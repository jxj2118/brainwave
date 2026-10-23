#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for argument in "$@"; do
  if [[ "$argument" = "--help" || "$argument" = "-h" ]]; then
    printf '%s\n' \
      'Usage: bun run build:android [Tauri Android build options]' \
      '       bun run build:android:debug   # standalone debug APK' \
      '       bun run build:android:aab     # signed Play Store bundle' \
      '       bun run android:keystore      # create a private local release key' \
      'Default target: aarch64. Override with --target aarch64 armv7 x86_64 i686.'
    exit 0
  fi
done

source scripts/android-env.sh
android_setup_environment

if [[ "${1:-}" = "--create-keystore" ]]; then
  exec bun scripts/create-android-keystore.ts
fi

debug_build=false
target_provided=false
for argument in "$@"; do
  case "$argument" in
    --debug|-d) debug_build=true ;;
    --target|--target=*|-t|-t?*) target_provided=true ;;
  esac
done
if ! "$debug_build"; then
  signing_properties="${BRAINWAVE_ANDROID_KEYSTORE_PROPERTIES:-$HOME/.config/brainwave-build/android/keystore.properties}"
  if [[ ! -f "$signing_properties" && ( -z "${ANDROID_KEYSTORE_PATH:-}" || -z "${ANDROID_KEYSTORE_PASSWORD:-}" || -z "${ANDROID_KEY_ALIAS:-}" ) ]]; then
    printf '%s\n' 'Android: Release signing is missing. Run bun run android:keystore first, or configure signing environment variables. Use build:android:debug for a standalone debug APK.' >&2
    exit 1
  fi
fi
if ! "$target_provided"; then set -- --target aarch64 "$@"; fi
printf 'Building Android installer with JDK: %s\nSDK: %s\nNDK: %s\n' "$JAVA_HOME" "$ANDROID_HOME" "$NDK_HOME"
bun run tauri android build --ci "$@"
printf '%s\n' 'Android packages: src-tauri/gen/android/app/build/outputs/apk/ or outputs/bundle/'
