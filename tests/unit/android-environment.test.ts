import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Catch packaging accidentally requiring adb, and ensure an explicit NDK
// override cannot silently be ignored.
test("Android build environment discovers toolchains without device tooling and preserves paths with spaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "brainwave-build-env-"));
  try {
    const jdk = join(root, "JDK 21");
    const sdk = join(root, "Android SDK");
    await mkdir(join(jdk, "bin"), { recursive: true });
    for (const name of ["java", "javac"]) {
      const path = join(jdk, "bin", name);
      await writeFile(
        path,
        "#!/bin/sh\necho 'openjdk version \"21.0.11\"' >&2\n",
      );
      await chmod(path, 0o755);
    }
    await mkdir(join(sdk, "platform-tools"), { recursive: true });
    for (const version of ["9.0.0", "28.2.1"]) {
      const ndk = join(sdk, "ndk", version);
      await mkdir(join(ndk, "toolchains/llvm"), { recursive: true });
      await writeFile(
        join(ndk, "source.properties"),
        `Pkg.Revision = ${version}`,
      );
    }
    async function setup(ndk: string) {
      const child = Bun.spawn(
        [
          "bash",
          "-c",
          'set -e; source "$1"; android_setup_environment; printf "%s\\n" "$JAVA_HOME" "$ANDROID_HOME" "$NDK_HOME"',
          "android-env-test",
          resolve("scripts/android-env.sh"),
        ],
        {
          env: {
            ...process.env,
            JAVA_HOME: jdk,
            ANDROID_HOME: sdk,
            NDK_HOME: ndk,
            ANDROID_NDK_HOME: "",
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      return {
        status: await child.exited,
        output: await new Response(child.stdout).text(),
        error: await new Response(child.stderr).text(),
      };
    }
    const ready = await setup("");
    expect(ready.status).toBe(0);
    expect(ready.output.trim().split("\n")).toEqual([
      jdk,
      sdk,
      join(sdk, "ndk/28.2.1"),
    ]);
    const invalid = await setup(join(root, "missing-ndk"));
    expect(invalid.status).not.toBe(0);
    expect(invalid.error).toContain("NDK_HOME");

    // Isolate the expensive Tauri command. Exercise our real shell launcher,
    // including macOS's system Bash, target overrides and failure propagation.
    await mkdir(join(root, "bin"));
    const bun = join(root, "bin/bun");
    await writeFile(bun, '#!/bin/sh\nprintf "%s\\n" "$@"\nexit 37\n');
    await chmod(bun, 0o755);
    const build = Bun.spawn(
      [
        process.platform === "darwin" ? "/bin/bash" : "bash",
        resolve("scripts/build-android.sh"),
        "--apk",
        "--debug",
        "--target",
        "x86_64",
      ],
      {
        env: {
          ...process.env,
          PATH: `${join(root, "bin")}:${process.env.PATH}`,
          JAVA_HOME: jdk,
          ANDROID_HOME: sdk,
          NDK_HOME: "",
          ANDROID_NDK_HOME: "",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(await build.exited).toBe(37);
    const output = await new Response(build.stdout).text();
    expect(output).toContain(
      "run\ntauri\nandroid\nbuild\n--ci\n--apk\n--debug\n--target\nx86_64\n",
    );
    expect(output).not.toContain("Android packages:");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
