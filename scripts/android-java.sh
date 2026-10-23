#!/usr/bin/env bash
# Print the first complete, supported JDK. Sourcing this file changes no environment.
android_select_java() {
  local android_java_candidate android_java_version
  for android_java_candidate in "$@"; do
    [[ -n "$android_java_candidate" && -x "$android_java_candidate/bin/java" && -x "$android_java_candidate/bin/javac" ]] || continue
    android_java_version="$("$android_java_candidate/bin/java" -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -n 1)"
    if [[ "$android_java_version" =~ ^[0-9]+$ ]] && (( android_java_version >= 17 )); then
      printf '%s\n' "$android_java_candidate"
      return 0
    fi
  done
  return 1
}
