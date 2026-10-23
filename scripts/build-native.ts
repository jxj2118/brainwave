import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

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
let customDmg = false;
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
  customDmg =
    process.platform === "darwin" &&
    !bundlesProvided &&
    !args.includes("--no-bundle");
  command = [
    "build",
    "--ci",
    ...(bundlesProvided || args.includes("--no-bundle")
      ? []
      : ["--bundles", process.platform === "darwin" ? "app" : "nsis"]),
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
const exitCode = await child.exited;
if (exitCode !== 0 || !customDmg) process.exit(exitCode);

function option(long: string, short?: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === long || argument === short) return args[i + 1];
    if (argument.startsWith(`${long}=`)) return argument.slice(long.length + 1);
    if (short && argument.startsWith(short))
      return argument.slice(short.length);
  }
}

const metadata = Bun.spawnSync(
  [
    "cargo",
    "metadata",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--no-deps",
    "--format-version",
    "1",
  ],
  { stdout: "pipe", stderr: "inherit" },
);
if (metadata.exitCode !== 0) process.exit(metadata.exitCode);
const { target_directory: targetDirectory } = JSON.parse(
  metadata.stdout.toString(),
);
const target = option("--target", "-t") ?? process.env.CARGO_BUILD_TARGET;
const profile =
  option("--profile") ??
  (args.includes("--debug") || args.includes("-d") ? "debug" : "release");
const bundle = resolve(targetDirectory, target ?? "", profile, "bundle");
const { version } = await Bun.file("package.json").json();
const packager = Bun.spawn(
  [
    "bash",
    "scripts/build-dmg.sh",
    resolve(bundle, "macos/Brainwave.app"),
    resolve(
      bundle,
      "dmg",
      `Brainwave_${version}_${target ?? process.arch}.dmg`,
    ),
  ],
  { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
);
process.exit(await packager.exited);
