import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const [platform, ...args] = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: bun run build:desktop [Tauri build options]");
  console.log("       bun run build:ios [Tauri iOS build options]");
  console.log("Desktop: macOS DMG / Windows NSIS EXE. iOS: signed device IPA.");
  console.log(
    "CLI options are forwarded to Tauri; build runs in release mode by default.",
  );
  process.exit(0);
}

let command: string[];
if (platform === "desktop") {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    console.error(
      "Build the desktop installer on macOS or Windows with its native toolchain.",
    );
    process.exit(1);
  }
  const bundlesProvided = args.some(
    (arg) =>
      arg === "--bundles" || arg.startsWith("--bundles=") || arg === "-b",
  );
  command = [
    "build",
    "--ci",
    ...(bundlesProvided
      ? []
      : ["--bundles", process.platform === "darwin" ? "app,dmg" : "nsis"]),
    ...args,
  ];
} else if (platform === "ios") {
  if (process.platform !== "darwin") {
    console.error(
      "An iOS IPA must be built on macOS with Xcode and Apple signing configured.",
    );
    process.exit(1);
  }
  command = ["ios", "build", "--ci", ...args];
} else {
  console.error("Choose desktop or ios.");
  process.exit(1);
}

const child = Bun.spawn([process.execPath, "run", "tauri", ...command], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);
