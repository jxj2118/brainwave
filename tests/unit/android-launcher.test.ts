import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

async function fakeJdk(
  root: string,
  name: string,
  version: string,
  compiler = true,
) {
  const home = join(root, name);
  await mkdir(join(home, "bin"), { recursive: true });
  const java = join(home, "bin/java");
  await writeFile(
    java,
    `#!/bin/sh\nprintf '%s\\n' 'openjdk version "${version}"' >&2\n`,
  );
  await chmod(java, 0o755);
  if (compiler) {
    await writeFile(join(home, "bin/javac"), "#!/bin/sh\nexit 0\n");
    await chmod(join(home, "bin/javac"), 0o755);
  }
  return home;
}
async function select(...candidates: string[]) {
  const process = Bun.spawn(
    [
      "bash",
      "-c",
      'source "$1"; shift; android_select_java "$@"',
      "android-java-test",
      resolve("scripts/android-java.sh"),
      ...candidates,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  return {
    status: await process.exited,
    home: (await new Response(process.stdout).text()).trim(),
  };
}
test("Android launcher skips Java 8 and keeps a supported explicit JDK, including paths with spaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "brainwave-java-"));
  try {
    const old = await fakeJdk(root, "old java", "1.8.0_472");
    const current = await fakeJdk(root, "JBR 21", "21.0.11");
    const supported = await fakeJdk(root, "JDK 17", "17.0.16");
    expect(await select(old, current)).toEqual({ status: 0, home: current });
    expect(await select(supported, current)).toEqual({
      status: 0,
      home: supported,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Android launcher rejects runtimes without a compiler and unknown Java versions", async () => {
  const root = await mkdtemp(join(tmpdir(), "brainwave-java-"));
  try {
    const runtime = await fakeJdk(root, "JRE", "21.0.11", false);
    const broken = await fakeJdk(root, "broken", "unknown");
    expect(await select("", join(root, "missing"), runtime, broken)).toEqual({
      status: 1,
      home: "",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
