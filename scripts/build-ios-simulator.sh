#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Build through Xcode directly when Tauri's runtime >= SDK preflight rejects an older installed simulator.
# No system SDK/runtime files or globally installed tools are patched.
bun run build
env IPHONEOS_DEPLOYMENT_TARGET=16.0 cargo build --manifest-path src-tauri/Cargo.toml --target aarch64-apple-ios-sim --features custom-protocol
mkdir -p src-tauri/gen/apple/Externals/arm64/debug
cp src-tauri/target/aarch64-apple-ios-sim/debug/libbrainwave_lib.a src-tauri/gen/apple/Externals/arm64/debug/libapp.a
xcodegen generate --spec src-tauri/gen/apple/project.yml
xcodebuild -project src-tauri/gen/apple/brainwave.xcodeproj -scheme brainwave_iOS -configuration debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath src-tauri/gen/apple/build BRAINWAVE_PREBUILT_RUST=1 CODE_SIGNING_ALLOWED=NO build
