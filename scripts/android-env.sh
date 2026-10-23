#!/usr/bin/env bash
# Shared by development, packaging and signing. No device or server side effects.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-java.sh"

android_setup_environment() {
  local android_java_home android_sdk_home android_ndk_home android_ndk_version
  local android_javac android_candidate
  local android_java_candidates=("${JAVA_HOME:-}")
  if [[ -x /usr/libexec/java_home ]]; then
    android_java_candidates+=("$(/usr/libexec/java_home -v 21 2>/dev/null || true)")
    android_java_candidates+=("$(/usr/libexec/java_home -v 17 2>/dev/null || true)")
  fi
  android_javac="$(command -v javac || true)"
  if [[ -n "$android_javac" ]]; then
    android_java_candidates+=("$(dirname "$(dirname "$android_javac")")")
  fi
  android_java_home="$(android_select_java "${android_java_candidates[@]}")" || {
    printf '%s\n' 'Android: No usable JDK 17+ found. Install JDK 21 or set JAVA_HOME to a complete JDK directory.' >&2
    return 1
  }
  if [[ -n "${JAVA_HOME:-}" && "$JAVA_HOME" != "$android_java_home" ]]; then
    printf 'Android: JAVA_HOME is not a usable JDK 17+; using %s for this build.\n' "$android_java_home" >&2
  fi
  android_sdk_home="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  if [[ -z "$android_sdk_home" ]]; then
    case "$(uname -s)" in
      Darwin) android_sdk_home="$HOME/Library/Android/sdk" ;;
      *) android_sdk_home="$HOME/Android/Sdk" ;;
    esac
  fi
  [[ -d "$android_sdk_home/platform-tools" ]] || {
    printf '%s\n' 'Android: Android SDK not found. Set ANDROID_HOME to your SDK directory.' >&2
    return 1
  }
  android_ndk_home="${NDK_HOME:-${ANDROID_NDK_HOME:-}}"
  if [[ -z "$android_ndk_home" ]]; then
    android_ndk_version="$(
      for android_candidate in "$android_sdk_home"/ndk/*; do
        if [[ -f "$android_candidate/source.properties" ]]; then basename "$android_candidate"; fi
      done | sort -t . -k1,1n -k2,2n -k3,3n | tail -n 1
    )"
    android_ndk_home="$android_sdk_home/ndk/$android_ndk_version"
  fi
  [[ -f "$android_ndk_home/source.properties" && -d "$android_ndk_home/toolchains/llvm" ]] || {
    printf '%s\n' 'Android: NDK_HOME does not contain a complete Android NDK installation. Install NDK (Side by side) or set NDK_HOME.' >&2
    return 1
  }
  export JAVA_HOME="$android_java_home" ANDROID_HOME="$android_sdk_home" NDK_HOME="$android_ndk_home"
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
}
