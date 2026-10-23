import { _android, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Opt-in test against an installed debug APK, using real Tauri IPC and the Rust filesystem core.
// It creates uniquely named test notes; it never resets or deletes a workspace.
const serial = process.env.BRAINWAVE_ANDROID_SERIAL ?? "emulator-5554";
const device = (await _android.devices({ omitDriverInstall: true })).find(
  (d) => d.serial() === serial,
);
if (!device)
  throw new Error(
    `Start the test emulator ${serial} and install the debug APK first.`,
  );
const pkg = "com.lor4ai.brainwave.debug";
const stamp = Date.now();
const folder = `Native${stamp}`;
const name = `Note${stamp}`;
const path = `workspaces/personal/${folder}/${name}.md`;
try {
  const webview = await device.webView({ pkg });
  let page = await webview.page();
  page.setDefaultTimeout(15000);
  await page.reload();
  await page.getByRole("button", { name: /^(Settings|设置)$/ }).click();
  await page.getByRole("combobox").selectOption("en");
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
  const body =
    "# 原生 Android 验证\n\n原生正文关键字 mobile-disk-check\n\n## 第二节\n- [ ] 保留内容";
  await page.getByRole("textbox", { name: "Note text" }).fill(body);
  await expect(
    page.getByText("Saved on device", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await device.shell(`run-as ${pkg} cat ${path}`)).toString(),
    )
    .toContain("mobile-disk-check");
  const disk = (await device.shell(`run-as ${pkg} cat ${path}`)).toString();
  expect(disk).toMatch(/^---\nid: [0-9a-f-]{14}7[0-9a-f-]+\ncreated_at:/);
  expect(disk.endsWith(body)).toBe(true);
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(
    page.getByRole("heading", { name: "原生 Android 验证" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Outline" }).click();
  await page.getByRole("button", { name: "第二节", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toBeFocused();
  await page.getByRole("tab", { name: "Preview" }).click();
  await device.shell("input keyevent KEYCODE_BACK");
  await expect(
    page.getByRole("heading", { name: folder, exact: true, level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("searchbox").fill("mobile-disk-check");
  await page
    .getByRole("button", { name: `${name} ${folder}/${name}.md` })
    .click();
  await expect(page.getByRole("textbox", { name: "Note text" })).toHaveValue(
    body,
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("combobox", { name: "Language" }).selectOption("zh-CN");
  await expect(
    page.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (
        await device.shell(`run-as ${pkg} cat runtime/preferences.json`)
      ).toString(),
    )
    .toContain('"zh-CN"');
  await device.shell(`am force-stop ${pkg}`);
  await device.shell(`am start -n ${pkg}/com.lor4ai.brainwave.MainActivity`);
  page = await (await device.webView({ pkg })).page();
  await expect(
    page.getByRole("heading", { name: "笔记", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: `${folder} 文件夹` }).click();
  await page.getByRole("button", { name: `${name} Markdown` }).click();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    body,
  );
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({ path: "docs/screenshots/android-native-editor.png" });
  const fullHeight = await page.evaluate(() => window.visualViewport!.height);
  await page.getByRole("textbox", { name: "笔记正文" }).click();
  await expect
    .poll(() => page.evaluate(() => window.visualViewport!.height))
    .toBeLessThan(fullHeight - 100);
  const keyboardLayout = await page.evaluate(() => {
    const text = document.querySelector("textarea")!.getBoundingClientRect();
    const dock = document
      .querySelector(".editor-dock")!
      .getBoundingClientRect();
    return {
      height: window.visualViewport!.height,
      textHeight: text.height,
      textBottom: text.bottom,
      dockTop: dock.top,
      dockBottom: dock.bottom,
    };
  });
  expect(keyboardLayout.textHeight).toBeGreaterThan(60);
  expect(keyboardLayout.dockBottom).toBeLessThanOrEqual(
    keyboardLayout.height + 1,
  );
  expect(keyboardLayout.dockTop).toBeGreaterThanOrEqual(
    keyboardLayout.textBottom - 1,
  );
  await page.screenshot({ path: "docs/screenshots/android-ui-keyboard.png" });
  await device.shell("input keyevent KEYCODE_BACK");
  console.log(
    "PASS: real Android folder/create/autosave/UTF-8 Markdown/preview/outline/system-back/search/dark/language/process-restart persistence/visible editor and dock above the software keyboard.",
  );
  console.log(`Verified native file: ${folder}/${name}.md`);
} finally {
  await device.close();
}
