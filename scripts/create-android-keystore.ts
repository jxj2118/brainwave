import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const properties = resolve(
  process.env.BRAINWAVE_ANDROID_KEYSTORE_PROPERTIES ||
    join(homedir(), ".config/brainwave-build/android/keystore.properties"),
);
const directory = dirname(properties);
const keystore = join(directory, "brainwave-release.jks");

async function exists(path: string) {
  return stat(path).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
}

if ((await exists(properties)) || (await exists(keystore))) {
  console.error(
    `Signing files already exist in ${directory}; kept existing keys.`,
  );
  process.exit(1);
}

await mkdir(directory, { recursive: true, mode: 0o700 });
// Reserve the properties path exclusively so two invocations cannot replace a key.
await writeFile(properties, "", { flag: "wx", mode: 0o600 });
try {
  const password = randomBytes(32).toString("hex");
  const keytool = join(process.env.JAVA_HOME!, "bin/keytool");
  const child = Bun.spawn(
    [
      keytool,
      "-genkeypair",
      "-noprompt",
      "-keystore",
      keystore,
      "-storetype",
      "JKS",
      "-keyalg",
      "RSA",
      "-keysize",
      "3072",
      "-validity",
      "10000",
      "-alias",
      "brainwave",
      "-dname",
      "CN=Brainwave, OU=Local Build, O=Brainwave, C=CN",
      "-storepass:env",
      "BRAINWAVE_NEW_KEY_PASSWORD",
      "-keypass:env",
      "BRAINWAVE_NEW_KEY_PASSWORD",
    ],
    {
      env: { ...process.env, BRAINWAVE_NEW_KEY_PASSWORD: password },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if ((await child.exited) !== 0) throw new Error("keytool failed");
  const { chmod } = await import("node:fs/promises");
  await chmod(keystore, 0o600);
  // Java properties treats backslashes as escapes, including on Windows.
  const escapedPath = keystore.replace(/\\/g, "\\\\");
  await writeFile(
    properties,
    `storeFile=${escapedPath}\nstorePassword=${password}\nkeyAlias=brainwave\nkeyPassword=${password}\n`,
    { mode: 0o600 },
  );
  console.log(`Release signing configured: ${properties}`);
  console.log(
    "Back up this directory securely. Future APK updates require the same signing key.",
  );
} catch (error) {
  await rm(properties, { force: true });
  console.error(error);
  process.exit(1);
}
