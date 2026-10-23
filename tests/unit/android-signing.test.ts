import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Losing this key makes existing release installations impossible to update.
test("release key setup refuses to replace existing keys or credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "brainwave-signing-"));
  try {
    const properties = join(root, "keystore.properties");
    const keystore = join(root, "brainwave-release.jks");
    for (const existing of [properties, keystore]) {
      await writeFile(existing, "existing-private-data");
      const child = Bun.spawn(
        [process.execPath, resolve("scripts/create-android-keystore.ts")],
        {
          env: {
            ...process.env,
            BRAINWAVE_ANDROID_KEYSTORE_PROPERTIES: properties,
            JAVA_HOME: join(root, "no-java"),
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      expect(await child.exited).toBe(1);
      expect(await new Response(child.stderr).text()).toContain(
        "kept existing keys",
      );
      expect(await readFile(existing, "utf8")).toBe("existing-private-data");
      await rm(existing);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
