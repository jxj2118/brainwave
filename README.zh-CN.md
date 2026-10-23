# Brainwave

[English](README.md) | **简体中文**

[官网](https://brainwave.lor4ai.com) · [下载](https://github.com/jxj2118/brainwave/releases) · [反馈](https://github.com/jxj2118/brainwave/issues)

本地优先、通过 Git 同步的 Markdown 笔记应用。笔记保存为普通文件，支持离线编辑，并通过你选择的 Git 远程仓库同步。

Brainwave 使用同一套 React 界面、Tauri 原生外壳和 Rust 核心，无需中心化的 Brainwave 服务。

## 特性

- **笔记就是文件。** 真实文件夹、Markdown 笔记和文件附件；无需 Brainwave 专用元数据，也能打开普通 Markdown。
- **离线写作。** 本地自动保存与恢复草稿，让编辑不依赖网络。
- **Git 同步。** 支持通用 HTTPS Git 远程，保留历史，明确处理冲突。
- **查找与回顾。** 文件夹导航、搜索、标题大纲和逐篇笔记版本历史。
- **一致的工作区。** 响应式布局，中英文，以及浅色、深色和跟随系统主题。

## 下载

请从 [GitHub Releases](https://github.com/jxj2118/brainwave/releases) 下载测试版安装包。每个 Release 会说明签名状态与验证范围。

| 平台         | 分发形式               | 当前状态                                              |
| ------------ | ---------------------- | ----------------------------------------------------- |
| macOS        | `.dmg`                 | 通用包已在 CI 构建；ad-hoc 签名，尚未公证             |
| Windows      | `-setup.exe`           | x64 安装包已在 CI 构建；未签名，待运行验收            |
| Android      | `.apk`                 | ARM64 APK、AAB 已在 CI 构建并签名；Android 7.0 及以上 |
| iOS / iPadOS | App Store / TestFlight | 真机归档已通过，签名与分发配置待完成；iOS 16 及以上   |
| Web / PWA    | 静态构建               | 可预览界面，浏览器笔记存储与 Git 同步待实现           |

项目处于早期开发阶段。每个 Release 的说明会列出实际验证的平台和架构。请在 Release 的 **Assets** 中下载安装包；GitHub 自动生成的源码压缩包包含的是应用源代码。

请为自己的笔记使用独立的 Git 仓库。本仓库用于开发 Brainwave 应用。

## 本地开发

安装 [Bun](https://bun.sh/)、[Rust](https://www.rust-lang.org/tools/install) 和对应平台的 [Tauri 工具链](https://v2.tauri.app/start/prerequisites/)。

```sh
bun install --frozen-lockfile
bun run tauri dev
```

使用 `bun run dev` 可以在浏览器中预览界面；原生笔记操作需要通过 Tauri 应用运行。

```sh
bun run check
cargo test --manifest-path crates/brainwave-core/Cargo.toml --locked
```

安装包构建：

```sh
bun run build:desktop
bun run build:android
bun run build:ios
```

Android release 构建需要发布密钥；首次配置可运行 `bun run android:keystore`。iOS 需要 Xcode 签名与描述文件。安装包输出路径由构建命令打印。

首次克隆后运行 `bun run hooks:install`，启用提交与推送前的公开文件检查。

## 参与贡献

欢迎问题报告和范围明确的 Pull Request。请附上平台、应用版本、复现步骤和相关日志，并移除凭据及私人笔记内容。涉及数据格式或同步行为的改动，请先通过 Issue 讨论设计。

## 许可证

项目采用 [MIT 许可证](LICENSE)。第三方资源遵循各自的许可证，包括 [Inter 字体许可证](src/shared/assets/fonts/LICENSE)。
