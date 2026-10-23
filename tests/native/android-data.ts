import { _android, expect, type Page } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// All transport is confined to an ephemeral local Git fixture and the dedicated test emulator.
const adb =
  process.env.BRAINWAVE_ADB ??
  Bun.which("adb") ??
  join(
    process.env.ANDROID_HOME ??
      process.env.ANDROID_SDK_ROOT ??
      (process.platform === "darwin"
        ? join(homedir(), "Library/Android/sdk")
        : join(homedir(), "Android/Sdk")),
    "platform-tools",
    process.platform === "win32" ? "adb.exe" : "adb",
  );
const serial = process.env.BRAINWAVE_ANDROID_SERIAL ?? "emulator-5554";
const pkg = "com.lor4ai.brainwave.debug";
const server = spawn("python3", ["tests/native/git-server.py"], {
  stdio: ["ignore", "pipe", "pipe"],
});
const fixture = await new Promise<{
  port: number;
  root: string;
  remote: string;
}>((resolve, reject) => {
  server.stdout.once("data", (data) => resolve(JSON.parse(data.toString())));
  server.once("error", reject);
  server.once("exit", (code) =>
    reject(new Error(`Git fixture exited: ${code}`)),
  );
});
const device = (await _android.devices({ omitDriverInstall: true })).find(
  (d) => d.serial() === serial,
);
if (!device) {
  server.kill();
  throw new Error(`Test emulator ${serial} not available`);
}
let page: Page;
async function invoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return page.evaluate(
    ({ command, args }) =>
      (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke<T>(
              command: string,
              args: Record<string, unknown>,
            ): Promise<T>;
          };
        }
      ).__TAURI_INTERNALS__.invoke<T>(command, args),
    { command, args },
  );
}
const stamp = Date.now();
const folder = `Data${stamp}`;
const name = `Original${stamp}`;
const renamed = `Renamed${stamp}`;
const git = (...args: string[]) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
try {
  execFileSync(adb, [
    "-s",
    serial,
    "reverse",
    `tcp:${fixture.port}`,
    `tcp:${fixture.port}`,
  ]);
  page = await (await device.webView({ pkg })).page();
  page.setDefaultTimeout(20000);
  await page.reload();
  await page.getByRole("button", { name: /^(Settings|设置)$/ }).click();
  await page
    .getByRole("combobox", { name: /^(Language|语言)$/ })
    .selectOption("en");
  await page.getByText("Git sync settings", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Git remote URL" })
    .fill(`http://127.0.0.1:${fixture.port}/remote.git`);
  await page
    .getByRole("textbox", { name: "Commit author name" })
    .fill("Mobile tester");
  await page
    .getByRole("textbox", { name: "Commit author email" })
    .fill("mobile@example.test");
  await page
    .getByRole("button", { name: "Save sync settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByRole("textbox", { name: "Folder name" }).fill(folder);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: `${folder} Folder` }).click();
  await page
    .getByRole("button", { name: "Create a note", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Note name" }).fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const notePath = `${folder}/${name}.md`;
  const text = await invoke<{ url: string }>("import_attachment", {
    note: notePath,
    name: "check.txt",
    bytes: Array.from(new TextEncoder().encode("Native attachment content")),
  });
  const png = Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const image = await invoke<{ url: string }>("import_attachment", {
    note: notePath,
    name: "image.png",
    bytes: png,
  });
  const body = `# Version one\n\nNative history and sync\n\n[Open text](${text.url})\n\n![Native pixel](${image.url})\n`;
  await page.getByRole("textbox", { name: "Note text" }).fill(body);
  await expect(
    page.getByText("Saved on device", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByRole("img", { name: "Native pixel" })).toBeVisible();
  const read = await invoke<{ bytes: number[] }>("read_attachment", {
    note: notePath,
    url: text.url,
  });
  expect(new TextDecoder().decode(new Uint8Array(read.bytes))).toBe(
    "Native attachment content",
  );
  await page.getByRole("button", { name: "Open text", exact: true }).click();
  await expect
    .poll(async () =>
      (await device.shell("dumpsys activity activities")).toString(),
    )
    .toContain("ChooserActivity");
  await device.shell("input keyevent KEYCODE_BACK");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("button", { name: "Create history snapshot", exact: true })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("tab", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Note text" })
    .fill(body.replace("Version one", "Version two"));
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("button", { name: /Mobile tester ·/ })
    .first()
    .click();
  await expect(page.locator(".version-content")).toContainText("Version one");
  await page
    .getByRole("button", { name: "Restore this version’s text", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm restore", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(
    body,
  );
  await page.getByRole("button", { name: "File actions", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(renamed);
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: renamed, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Synced" }),
  ).toBeVisible({ timeout: 30000 });
  const remoteText = git(
    "--git-dir",
    fixture.remote,
    "show",
    `main:${folder}/${renamed}.md`,
  );
  expect(remoteText).toContain("Version one");
  expect(remoteText).toContain(`${renamed}.assets/check.txt`);
  const peer = await mkdtemp(join(tmpdir(), "brainwave-peer-"));
  git("clone", fixture.remote, peer);
  const peerNote = join(peer, folder, `${renamed}.md`);
  await writeFile(
    peerNote,
    (await readFile(peerNote, "utf8")).replace(
      "Native history and sync",
      "Remote peer edit",
    ),
  );
  git("-C", peer, "add", "--", `${folder}/${renamed}.md`);
  git(
    "-C",
    peer,
    "-c",
    "user.name=Peer",
    "-c",
    "user.email=peer@example.test",
    "commit",
    "-m",
    "peer edit",
  );
  git("-C", peer, "push", "origin", "main");
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect
    .poll(async () =>
      (
        await device.shell(
          `run-as ${pkg} cat workspaces/personal/${folder}/${renamed}.md`,
        )
      ).toString(),
    )
    .toContain("Remote peer edit");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: `${renamed} Markdown` }).click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(
    /Remote peer edit/,
  );
  const beforeConflict = await page
    .getByRole("textbox", { name: "Note text" })
    .inputValue();
  await page
    .getByRole("textbox", { name: "Note text" })
    .fill(beforeConflict.replace("Remote peer edit", "Local competing edit"));
  await expect(
    page.getByText("Saved on device", { exact: true }),
  ).toBeVisible();
  await writeFile(
    peerNote,
    (await readFile(peerNote, "utf8")).replace(
      "Remote peer edit",
      "Remote competing edit",
    ),
  );
  git("-C", peer, "add", "--", `${folder}/${renamed}.md`);
  git(
    "-C",
    peer,
    "-c",
    "user.name=Peer",
    "-c",
    "user.email=peer@example.test",
    "commit",
    "-m",
    "peer conflicting edit",
  );
  git("-C", peer, "push", "origin", "main");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.locator(".conflict-item")).toHaveCount(1);
  await device.shell(`am force-stop ${pkg}`);
  await device.shell(`am start -n ${pkg}/com.lor4ai.brainwave.MainActivity`);
  page = await (await device.webView({ pkg })).page();
  page.setDefaultTimeout(20000);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator(".conflict-item")).toHaveCount(1);
  await page.getByText("Local version", { exact: true }).click();
  await expect(page.locator(".conflict-item")).toContainText(
    "Local competing edit",
  );
  await page.getByText("Remote version", { exact: true }).click();
  await expect(page.locator(".conflict-item")).toContainText(
    "Remote competing edit",
  );
  await page.screenshot({ path: "docs/screenshots/android-sync-conflict.png" });
  await page.getByRole("button", { name: "Use remote", exact: true }).click();
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Synced" }),
  ).toBeVisible();
  const merged = git(
    "--git-dir",
    fixture.remote,
    "show",
    `main:${folder}/${renamed}.md`,
  );
  expect(merged).toContain("Remote competing edit");
  expect(
    git(
      "--git-dir",
      fixture.remote,
      "rev-list",
      "--parents",
      "-n",
      "1",
      "main",
    ).split(" "),
  ).toHaveLength(3);
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: `${folder} Folder` }).click();
  await page.getByRole("button", { name: `${renamed} Markdown` }).click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(
    /Remote competing edit/,
  );
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({ path: "docs/screenshots/android-data-sync.png" });
  await page.getByRole("button", { name: "File actions", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveCount(0);
  const check = (
    await device.shell(`run-as ${pkg} ls workspaces/personal/${folder}`)
  ).toString();
  expect(check).not.toContain(renamed);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Synced" }),
  ).toBeVisible();
  expect(
    git(
      "--git-dir",
      fixture.remote,
      "ls-tree",
      "--name-only",
      "main",
      `${folder}/${renamed}.md`,
    ),
  ).toBe("");
  console.log(
    "PASS: actual Android attachments/image preview/native chooser/Git history/body restore/rename/delete/smart HTTP push/remote fast-forward/conflict recovery after process restart/explicit merge resolution, with real Rust IPC and disk files.",
  );
} finally {
  if (page!)
    await invoke("configure_sync", {
      remote: "",
      name: "Mobile tester",
      email: "mobile@example.test",
      username: "",
      token: "",
    }).catch(() => {});
  execFileSync(adb, [
    "-s",
    serial,
    "reverse",
    "--remove",
    `tcp:${fixture.port}`,
  ]);
  server.kill("SIGINT");
  await device.close();
}
