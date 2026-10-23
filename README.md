# Brainwave

**English** | [简体中文](README.zh-CN.md)

[Website](https://brainwave.lor4ai.com) · [Downloads](https://github.com/jxj2118/brainwave/releases) · [Issues](https://github.com/jxj2118/brainwave/issues)

A local-first Markdown note app with Git-backed synchronization. Keep your notes as ordinary files, work offline, and sync through a Git remote you choose.

Brainwave runs on a shared React frontend with a Tauri native shell and a Rust core. It requires no central Brainwave server.

## Features

- **Your notes, your files.** Real folders, Markdown notes, and file attachments. Ordinary Markdown files work without Brainwave-specific metadata.
- **Write offline.** Local autosave and recovery drafts keep editing independent of network availability.
- **Sync with Git.** Provider-independent HTTPS remotes, preserved history, and explicit conflict resolution.
- **Find and revisit.** Folder navigation, search, heading outlines, and per-note version history.
- **A consistent workspace.** Responsive layouts, English and Chinese, and light, dark, or system themes.

## Download

Installers are distributed through [GitHub Releases](https://github.com/jxj2118/brainwave/releases). Until the first release is published, build from source using the instructions below.

| Platform     | Package                | Current status                                                                        |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------- |
| macOS        | `.dmg`                 | Apple Silicon package built and verified locally; current packages use ad-hoc signing |
| Windows      | `-setup.exe`           | Build entry available; native Windows validation pending                              |
| Android      | `.apk`                 | ARM64 release package built and signature verified locally; Android 7.0+              |
| iOS / iPadOS | App Store / TestFlight | Device archive builds; signing and distribution setup pending; iOS 16+                |
| Web / PWA    | Static build           | UI preview available; browser note storage and Git sync are pending                   |

This project is in early development. Release notes describe which platforms and architectures have been tested. Download the installer from a release's **Assets** section; GitHub's automatically generated source archives contain the application source.

Use a separate Git repository for your notes. The Brainwave source repository is for developing the application.

## Development

Install [Bun](https://bun.sh/), [Rust](https://www.rust-lang.org/tools/install), and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.

```sh
bun install --frozen-lockfile
bun run tauri dev
```

For a browser UI preview, use `bun run dev`. Native note operations require the Tauri application.

```sh
bun run check
cargo test --manifest-path crates/brainwave-core/Cargo.toml --locked
```

Build an installer:

```sh
bun run build:desktop
bun run build:android
bun run build:ios
```

Android release builds require a signing key; run `bun run android:keystore` once to create a private local identity. iOS requires Xcode signing and provisioning. Build commands print the installer output paths.

Run `bun run hooks:install` after cloning to enable publication checks before commits and pushes.

## Contributing

Bug reports and focused pull requests are welcome. Include your platform, application version, steps to reproduce, and relevant logs with credentials and private note content removed. For changes to data formats or synchronization, open an issue to discuss the design first.

## License

Licensed under the [MIT License](LICENSE). Third-party assets retain their respective licenses, including the [Inter font license](src/shared/assets/fonts/LICENSE).
