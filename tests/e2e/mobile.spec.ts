import { test, expect, type Page } from "@playwright/test";

async function go(
  page: Page,
  label: string,
  { menu = "打开导航", nav = "导航" } = {},
) {
  const opener = page.getByRole("button", { name: menu, exact: true });
  if (await opener.isVisible()) await opener.click();
  await page
    .getByRole("navigation", { name: nav, exact: true })
    .getByRole("button", { name: label, exact: true })
    .first()
    .click();
}
const english = { menu: "Open navigation", nav: "Navigation" };

async function saveTestedSync(
  page: Page,
  remote = "https://git.example.test/notes.git",
) {
  await page.getByRole("textbox", { name: "Git 远程地址" }).fill(remote);
  await page.getByRole("textbox", { name: "提交者名称" }).fill("Writer");
  await page
    .getByRole("textbox", { name: "提交者邮箱" })
    .fill("writer@example.test");
  if (remote)
    await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await page.getByRole("button", { name: "保存同步设置" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "同步设置已保存。" }),
  ).toBeVisible();
}

test("only an unsaved note requests a leave confirmation", async ({ page }) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("草稿保护");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记正文" }).fill("尚未保存的正文");
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "立即保存", exact: true }).click();
  await expect(page.getByText("已保存到设备", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
});

for (const [height, size] of [
  [568, 32],
  [350, 16],
])
  test(`long editor title stays usable at ${height}px height and ${size}px text`, async ({
    page,
  }) => {
    await nativeIpcFixture(page);
    await page.setViewportSize({ width: 320, height });
    await page.goto("/");
    await page.getByRole("button", { name: "创建笔记", exact: true }).click();
    await page
      .getByRole("textbox", { name: "笔记名称" })
      .fill("Longfilename".repeat(10));
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}px`;
    }, size);
    const input = await page
      .getByRole("textbox", { name: "笔记正文" })
      .boundingBox();
    const dock = await page.locator(".editor-dock").boundingBox();
    expect(input!.height).toBeGreaterThan(60);
    expect(dock!.y).toBeGreaterThanOrEqual(input!.y + input!.height - 1);
    expect(dock!.y + dock!.height).toBeLessThanOrEqual(height + 1);
    expect(
      await page
        .locator(".editor-dock")
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
  });

test("200 percent English editor dock reflows every control", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "fixture.preferences",
      JSON.stringify({ locale: "en", theme: "light" }),
    ),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Create a note", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Note name" }).fill("Short");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "32px";
  });
  const dock = page.locator(".editor-dock");
  expect(
    await dock.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  const box = await dock.boundingBox();
  for (const tab of await page.getByRole("tab").all()) {
    const bounds = await tab.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(box!.x);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      box!.x + box!.width + 1,
    );
  }
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create history snapshot" }),
  ).toBeVisible();
});

test("file action sheet returns focus to its trigger after a delayed read", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem(
      "fixture.files",
      JSON.stringify({
        "Short.md": {
          path: "Short.md",
          body: "text",
          revision: "r1",
          id: "short",
        },
      }),
    );
  });
  await page.reload();
  await page.evaluate(() => {
    const bridge = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (name: string, args: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    const invoke = bridge.invoke;
    bridge.invoke = async (name, args) => {
      if (name === "read_note")
        await new Promise((resolve) => setTimeout(resolve, 500));
      return invoke(name, args);
    };
  });
  const trigger = page.getByRole("button", {
    name: "文件操作: Short",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("sync disables file actions while keeping notes readable", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "fixture.files",
      JSON.stringify({
        "Short.md": {
          path: "Short.md",
          body: "text",
          revision: "r1",
          id: "short",
        },
      }),
    ),
  );
  await page.reload();
  await go(page, "同步");
  await saveTestedSync(page);
  await page.evaluate(() => {
    const state = window as unknown as {
      __releaseSync?: () => void;
      __TAURI_INTERNALS__: {
        invoke: (name: string, args: unknown) => Promise<unknown>;
      };
    };
    const invoke = state.__TAURI_INTERNALS__.invoke;
    state.__TAURI_INTERNALS__.invoke = async (name, args) => {
      if (name === "sync_now")
        await new Promise<void>((resolve) => {
          state.__releaseSync = resolve;
        });
      return invoke(name, args);
    };
  });
  await page.getByRole("button", { name: "立即同步", exact: true }).click();
  await go(page, "工作区");
  await expect(
    page.getByRole("button", { name: "Short 我的工作区", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "文件操作: Short", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() =>
    (window as unknown as { __releaseSync: () => void }).__releaseSync(),
  );
  await expect(
    page.getByRole("button", { name: "文件操作: Short", exact: true }),
  ).toBeEnabled();
});

test("search clear restores input focus and a busy dialog rejects Escape", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await go(page, "搜索");
  await page.getByRole("searchbox").fill("清除测试");
  await page.getByRole("button", { name: "清空搜索", exact: true }).click();
  await expect(page.getByRole("searchbox")).toBeFocused();
  await go(page, "工作区");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("等待保存");
  await page.evaluate(() => {
    const bridge = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (name: string, args: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    const invoke = bridge.invoke;
    bridge.invoke = async (name, args) => {
      if (name === "create_note")
        await new Promise((resolve) => setTimeout(resolve, 800));
      return invoke(name, args);
    };
  });
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "等待保存", exact: true, level: 1 }),
  ).toBeVisible();
});

for (const width of [390, 1024, 1440])
  for (const theme of ["light", "dark"] as const) {
    test(`populated English design ${width}px ${theme}: home, editor and settings`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await nativeIpcFixture(page);
      await page.goto("/");
      await page.evaluate(
        ({ theme }) => {
          localStorage.setItem(
            "fixture.preferences",
            JSON.stringify({ locale: "en", theme }),
          );
          localStorage.setItem(
            "fixture.folders",
            JSON.stringify(["Personal", "Project Ideas"]),
          );
          localStorage.setItem(
            "fixture.files",
            JSON.stringify({
              "Android verification.md": {
                path: "Android verification.md",
                body: "# Native Android check\n\nCapture ideas with mobile-disk-check.\n\n## Second section\n- [ ] Preserve the original text",
                revision: "r1",
                id: "note-1",
              },
              "Product ideas.md": {
                path: "Product ideas.md",
                body: "A few thoughts and records for a calmer workspace.",
                revision: "r1",
                id: "note-2",
              },
              "Personal/Learning notes.md": {
                path: "Personal/Learning notes.md",
                body: "Write down what you learn.",
                revision: "r1",
                id: "note-3",
              },
            }),
          );
        },
        { theme },
      );
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Android verification My workspace" }),
      ).toContainText("mobile-disk-check");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await page.screenshot({
        path: `docs/screenshots/ui-populated-${width}-${theme}.png`,
        animations: "disabled",
      });
      if (width < 1024) {
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
        await page
          .getByRole("treeitem", { name: "Personal", exact: true })
          .click();
        await page.screenshot({
          path: `docs/screenshots/ui-drawer-${width}-${theme}.png`,
          animations: "disabled",
        });
        await page.keyboard.press("Escape");
      } else
        await page
          .getByRole("treeitem", { name: "Personal", exact: true })
          .click();
      await page
        .getByRole("button", { name: "Android verification My workspace" })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Note text" }),
      ).toHaveValue(/Preserve the original text/);
      await page.screenshot({
        path: `docs/screenshots/ui-editor-${width}-${theme}.png`,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await go(page, "Synchronization", english);
      await expect(
        page.getByRole("button", { name: "Test connection", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: `docs/screenshots/ui-sync-${width}-${theme}.png`,
        animations: "disabled",
      });
      await go(page, "Settings", english);
      await expect(
        page.getByRole("button", {
          name: theme === "dark" ? "Dark" : "Light",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.screenshot({
        path: `docs/screenshots/ui-settings-${width}-${theme}.png`,
        animations: "disabled",
      });
    });
  }

test("large text, long conflict paths and reduced motion stay within a narrow viewport", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "24px";
    localStorage.setItem(
      "fixture.sync",
      JSON.stringify({
        remote: "https://git.example.test/notes.git",
        name: "Writer",
        email: "writer@example.test",
        branch: "main",
      }),
    );
    const path = "长路径".repeat(50) + ".md";
    localStorage.setItem(
      "fixture.conflicts",
      JSON.stringify([
        {
          key: path,
          kind: "content",
          base: null,
          local: { path, text: "a".repeat(1000), size: 1000 },
          remote: { path, text: "b".repeat(1000), size: 1000 },
        },
      ]),
    );
  });
  // The status hook reads storage at startup; reload recreates it without changing note data.
  await page.reload();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "24px";
  });
  await go(page, "同步");
  await page.getByText("本地版本", { exact: true }).click();
  await expect(page.locator(".conflict-content").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  const main = page.getByRole("main");
  expect(
    await main.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
});

for (const width of [320, 390, 768, 1024, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`responsive design ${width}px ${theme}: top navigation, readable content and reusable dialogs`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await nativeIpcFixture(page);
      await page.goto("/");
      await go(page, "设置");
      await page
        .getByRole("button", {
          name: theme === "light" ? "浅色" : "深色",
          exact: true,
        })
        .click();
      await go(page, "工作区");
      const entry = await (
        width >= 1024
          ? page.getByRole("navigation", { name: "导航", exact: true })
          : page.getByRole("button", { name: "打开导航", exact: true })
      ).boundingBox();
      expect(entry!.y).toBeLessThan(180);
      expect(entry!.x).toBeLessThan(40);
      const main = await page.getByRole("main").boundingBox();
      if (width >= 1024) expect(main!.width).toBeGreaterThan(width - 300);
      else if (width >= 768) expect(main!.width).toBeGreaterThan(width * 0.75);
      await page.getByRole("button", { name: "创建笔记", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toHaveAccessibleName("新建笔记");
      await page
        .getByRole("textbox", { name: "笔记名称" })
        .fill("长标题-".repeat(20));
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: "创建笔记", exact: true }),
      ).toBeFocused();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      await page.screenshot({
        path: `docs/screenshots/ui-home-${width}-${theme}.png`,
        animations: "disabled",
      });
    });
  }
}

test("editor dock supports keyboard tabs and leaves a usable writing area", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("工具条验证");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page
    .getByRole("textbox", { name: "笔记正文" })
    .fill("# 键盘导航\n\n正文");
  const edit = page.getByRole("tab", { name: "编辑", exact: true });
  const input = await page
    .getByRole("textbox", { name: "笔记正文" })
    .boundingBox();
  const tab = await edit.boundingBox();
  expect(input!.height).toBeGreaterThan(160);
  expect(tab!.y).toBeGreaterThan(input!.y);
  await edit.focus();
  await edit.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "预览", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "键盘导航", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "预览", exact: true })
    .press("ArrowRight");
  await page.getByRole("button", { name: "键盘导航", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toBeFocused();
});

async function nativeIpcFixture(page: Page) {
  // Mock only the IPC boundary for UI tests. Rust integration tests and Simulator acceptance validate disk storage.
  await page.addInitScript(() => {
    type File = { path: string; body: string; revision: string; id: string };
    const windowWithTauri = window as unknown as {
      isTauri: boolean;
      __TAURI_INTERNALS__: unknown;
    };
    windowWithTauri.isTauri = true;
    const load = (): Record<string, File> =>
      JSON.parse(localStorage.getItem("fixture.files") || "{}");
    const folders = (): string[] =>
      JSON.parse(localStorage.getItem("fixture.folders") || "[]");
    const persist = (files: Record<string, File>) =>
      localStorage.setItem("fixture.files", JSON.stringify(files));
    const syncStatus = () => ({
      phase:
        localStorage.getItem("fixture.conflicts") !== null
          ? "conflict"
          : "local",
      head: "abc",
      branch: "main",
      conflicts: JSON.parse(localStorage.getItem("fixture.conflicts") || "[]"),
      configuration: JSON.parse(
        localStorage.getItem("fixture.sync") ||
          '{"remote":"","name":"","email":"","branch":null}',
      ),
    });
    windowWithTauri.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: Record<string, unknown> = {}) => {
        const files = load();
        const path = args.path as string;
        switch (command) {
          case "scan_notes":
            return [
              ...folders().map((path) => ({
                path,
                name: path.split("/").at(-1),
                kind: "folder",
                id: null,
                identityCollision: false,
              })),
              ...Object.values(files).map((file) => ({
                path: file.path,
                name: file.path.split("/").at(-1)!.slice(0, -3),
                kind: "note",
                id: file.id,
                identityCollision: false,
              })),
            ];
          case "read_note":
            if (!files[path]) throw { code: "notFound" };
            return files[path];
          case "create_note": {
            const name = args.name as string;
            const filename = `${args.folder ? args.folder + "/" : ""}${name}.md`;
            if (files[filename]) throw { code: "alreadyExists" };
            const value = {
              path: filename,
              body: "",
              revision: "r1",
              id: crypto.randomUUID(),
            };
            files[filename] = value;
            persist(files);
            return value;
          }
          case "save_note": {
            if (!files[path]) throw { code: "notFound" };
            if (files[path].revision !== args.expectedRevision)
              throw { code: "externalChange" };
            files[path] = {
              ...files[path],
              body: args.body as string,
              revision: files[path].revision + "+",
            };
            persist(files);
            return files[path];
          }
          case "create_folder": {
            const current = folders();
            const value = `${args.folder ? args.folder + "/" : ""}${args.name}`;
            if (current.includes(value)) throw { code: "alreadyExists" };
            localStorage.setItem(
              "fixture.folders",
              JSON.stringify([...current, value]),
            );
            return;
          }
          case "move_entry": {
            const destination = `${args.folder ? args.folder + "/" : ""}${args.name}${files[path] ? ".md" : ""}`;
            if (files[destination] || folders().includes(destination))
              throw { code: "alreadyExists" };
            if (files[path]) {
              if (files[path].revision !== args.expectedRevision)
                throw { code: "externalChange" };
              files[destination] = { ...files[path], path: destination };
              delete files[path];
              persist(files);
            } else {
              localStorage.setItem(
                "fixture.folders",
                JSON.stringify(
                  folders().map((p) =>
                    p === path || p.startsWith(path + "/")
                      ? destination + p.slice(path.length)
                      : p,
                  ),
                ),
              );
            }
            return destination;
          }
          case "delete_entry":
            delete files[path];
            persist(files);
            localStorage.setItem(
              "fixture.folders",
              JSON.stringify(
                folders().filter(
                  (p) => p !== path && !p.startsWith(path + "/"),
                ),
              ),
            );
            return;
          case "import_attachment":
            return {
              name: args.name,
              url: `./${(args.note as string).split("/").at(-1)!.slice(0, -3)}.assets/${args.name}`,
              size: (args.bytes as number[]).length,
            };
          case "read_attachment":
            return {
              bytes: [137, 80, 78, 71, 13, 10, 26, 10],
              mime: "image/png",
            };
          case "sync_status":
            return syncStatus();
          case "resolve_conflict": {
            const next = syncStatus().conflicts.filter(
              (item: { key: string }) => item.key !== args.key,
            );
            localStorage.setItem("fixture.conflicts", JSON.stringify(next));
            return syncStatus();
          }
          case "configure_sync": {
            localStorage.setItem(
              "fixture.sync",
              JSON.stringify({
                remote: args.remote,
                name: args.name,
                email: args.email,
                branch: null,
              }),
            );
            const stored = JSON.parse(
              localStorage.getItem("fixture.credentials") ||
                '{"username":"","token":""}',
            );
            localStorage.setItem(
              "fixture.credentials",
              JSON.stringify({
                username: args.username,
                token: (args.token as string) || stored.token,
              }),
            );
            return;
          }
          case "test_sync_remote": {
            localStorage.setItem(
              "fixture.probeCalls",
              JSON.stringify([
                ...JSON.parse(
                  localStorage.getItem("fixture.probeCalls") || "[]",
                ),
                args,
              ]),
            );
            const probe = JSON.parse(
              localStorage.getItem("fixture.probe") ||
                '{"defaultBranch":"main","empty":false}',
            );
            if (probe.error) throw { code: probe.error };
            return probe;
          }
          case "sync_credentials": {
            const stored = JSON.parse(
              localStorage.getItem("fixture.credentials") ||
                '{"username":"","token":""}',
            );
            return { username: stored.username, hasToken: !!stored.token };
          }
          case "clear_sync_credentials":
            localStorage.removeItem("fixture.credentials");
            return;
          case "load_ui_state":
            return JSON.parse(localStorage.getItem("fixture.ui") || "{}");
          case "save_ui_state":
            localStorage.setItem("fixture.ui", JSON.stringify(args.value));
            return;
          case "sync_now": {
            const status = syncStatus();
            if (status.conflicts.length) return status;
            localStorage.removeItem("fixture.conflicts");
            return { ...status, phase: "synced" };
          }
          case "open_attachment":
            return;
          case "checkpoint": {
            if (!JSON.parse(localStorage.getItem("fixture.sync") || "{}").name)
              throw { code: "identityRequired" };
            localStorage.setItem("fixture.versions", JSON.stringify(files));
            return "abc";
          }
          case "note_history": {
            const versions = JSON.parse(
              localStorage.getItem("fixture.versions") || "{}",
            );
            return versions[path]
              ? [
                  {
                    oid: "abc1234",
                    message: "brainwave: snapshot",
                    author: "Writer",
                    timestamp: 1792540800,
                    path,
                  },
                ]
              : [];
          }
          case "read_version":
            return (
              "---\nid: stable\n---\n" +
              JSON.parse(localStorage.getItem("fixture.versions") || "{}")[path]
                .body
            );
          case "load_preferences":
            return JSON.parse(
              localStorage.getItem("fixture.preferences") || "{}",
            );
          case "save_preferences":
            localStorage.setItem(
              "fixture.preferences",
              JSON.stringify(args.value),
            );
            return;
          case "read_draft": {
            const draft = JSON.parse(
              localStorage.getItem("fixture.draft") || "null",
            );
            return draft?.path === path ? draft : null;
          }
          case "write_draft":
            localStorage.setItem("fixture.draft", JSON.stringify(args.value));
            return;
          case "clear_draft":
            localStorage.removeItem("fixture.draft");
            return;
          default:
            throw { code: "io" };
        }
      },
    };
  });
}

test("formatting toolbar edits Markdown in place, keeps focus and saves", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("格式");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  const body = page.getByRole("textbox", { name: "笔记正文" });
  await body.fill("标题\n阅读 docs");
  await body.evaluate((node: HTMLTextAreaElement) =>
    node.setSelectionRange(1, 1),
  );
  const toolbar = page.getByRole("toolbar", { name: "格式" });
  await toolbar.getByRole("button", { name: "标题", exact: true }).click();
  await expect(body).toHaveValue("# 标题\n阅读 docs");
  await expect(body).toBeFocused();
  await body.evaluate((node: HTMLTextAreaElement) =>
    node.setSelectionRange(8, 12),
  );
  await toolbar.getByRole("button", { name: "链接", exact: true }).click();
  await expect(body).toHaveValue("# 标题\n阅读 [docs](https://)");
  await expect
    .poll(() =>
      body.evaluate((node: HTMLTextAreaElement) =>
        node.value.slice(node.selectionStart, node.selectionEnd),
      ),
    )
    .toBe("https://");
  await expect(page.getByText("已保存到设备", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  await expect(toolbar).toHaveCount(0);
});

test("mobile local note journey: folders, autosave, preview, outline, search and reopen", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("button", { name: "新建文件夹", exact: true }).click();
  await page.getByRole("textbox", { name: "文件夹名称" }).fill("学习");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page
    .getByRole("button", { name: "文件操作: 学习", exact: true })
    .click();
  await page.getByRole("button", { name: "新建笔记", exact: true }).click();
  await expect(page.getByText("创建位置: 学习")).toBeVisible();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("手机笔记");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page
    .getByRole("textbox", { name: "笔记正文" })
    .fill("# 今天的想法\n\n内容搜索关键字：月光\n\n## 下一步\n- [ ] 验证保存");
  await expect(page.getByText("已保存到设备", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "预览" }).click();
  await expect(page.getByRole("heading", { name: "今天的想法" })).toBeVisible();
  await page.getByRole("tab", { name: "大纲" }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toBeFocused();
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await go(page, "搜索");
  await page.getByRole("searchbox").fill("月光");
  await page
    .getByRole("button", { name: "手机笔记 学习", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    /月光/,
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "最近文档" })).toBeVisible();
  await page
    .getByRole("button", { name: "手机笔记 学习", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    /今天的想法/,
  );
});

test("language and theme persist; system changes affect only system mode", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await go(page, "设置");
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("combobox", { name: "语言" }).selectOption("en");
  await page.reload();
  await go(page, "Settings", english);
  await expect(page.getByRole("combobox", { name: "Language" })).toHaveValue(
    "en",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Follow system", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("320px mobile dialogs stay on screen and creation errors preserve input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await nativeIpcFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("同名笔记");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("同名笔记");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("同名文件或文件夹已存在");
  await expect(page.getByRole("textbox", { name: "笔记名称" })).toHaveValue(
    "同名笔记",
  );
  const bounds = await page.getByRole("dialog").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
});

test("browser capabilities are honest and settings work without a native bridge", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("手机应用预览", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "创建笔记", exact: true }),
  ).toHaveCount(0);
  await go(page, "设置");
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("valid JSON with invalid preference shapes never leaves startup blank", async ({
  page,
}) => {
  for (const value of [null, 42, true, "x", []]) {
    await page.goto("/");
    await page.evaluate(
      (value) =>
        localStorage.setItem("brainwave.preferences", JSON.stringify(value)),
      value,
    );
    await page.reload();
    await expect(page.getByText("手机应用预览", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "打开导航", exact: true }),
    ).toBeVisible();
  }
});

test("system/browser back flushes a pending edit and returns to the note list", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("返回验证");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记正文" }).fill("返回前必须保存");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "工作区", exact: true, level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回验证 我的工作区" }).click();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    "返回前必须保存",
  );
});

test("back navigation cannot discard a conflicting draft; saving a copy resolves it", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("冲突验证");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.evaluate(() => {
    const files = JSON.parse(localStorage.getItem("fixture.files")!);
    files["冲突验证.md"].body = "外部修改";
    files["冲突验证.md"].revision = "external";
    localStorage.setItem("fixture.files", JSON.stringify(files));
  });
  await page.getByRole("textbox", { name: "笔记正文" }).fill("需要保留的草稿");
  await page.goBack();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    "需要保留的草稿",
  );
  await page
    .getByRole("button", { name: "将草稿另存为新笔记", exact: true })
    .click();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("恢复副本");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "恢复副本", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    "需要保留的草稿",
  );
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "冲突验证 我的工作区" }).click();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    "外部修改",
  );
});

test("phone file actions move, rename, attach and explicitly delete", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  await page.getByRole("button", { name: "新建", exact: true }).click();
  await page.getByRole("button", { name: "新建文件夹", exact: true }).click();
  await page.getByRole("textbox", { name: "文件夹名称" }).fill("存档");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("原稿");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记正文" }).fill("不可丢失的内容");
  await page.getByRole("button", { name: "文件操作", exact: true }).click();
  await page.getByRole("textbox", { name: "名称", exact: true }).fill("新名字");
  await page.getByRole("combobox", { name: "移动到" }).selectOption("存档");
  await page.getByRole("button", { name: "应用修改" }).click();
  await expect(
    page.getByRole("heading", { name: "新名字", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    "不可丢失的内容",
  );
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "添加附件" }).click();
  await (
    await chooser
  ).setFiles({
    name: "notes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("pdf"),
  });
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    /\[notes.pdf\]\(.\/新名字.assets\/notes.pdf\)/,
  );
  await page.getByRole("button", { name: "文件操作", exact: true }).click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByText("笔记及其专属附件会从工作区移除")).toBeVisible();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /新名字/ })).toHaveCount(0);
});

test("Git author setup, local checkpoint and body restore on a narrow dark phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await nativeIpcFixture(page);
  await page.goto("/");
  await go(page, "设置");
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await go(page, "同步");
  await saveTestedSync(page, "");
  await go(page, "工作区");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("历史验证");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记正文" }).fill("第一版");
  await page.getByRole("button", { name: "历史", exact: true }).click();
  await page.getByRole("button", { name: "创建历史快照", exact: true }).click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记正文" }).fill("第二版");
  await page.getByRole("button", { name: "历史", exact: true }).click();
  await page.getByRole("button", { name: /Writer · abc1234/ }).click();
  await expect(page.locator(".version-content")).toContainText("第一版");
  await page.getByRole("button", { name: "恢复此版正文", exact: true }).click();
  await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    "第一版",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
});

test("phone conflict choices survive reload and finish only after explicit sync", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem(
      "fixture.sync",
      JSON.stringify({
        remote: "https://git.example.test/notes.git",
        name: "Writer",
        email: "writer@example.test",
        branch: "main",
      }),
    );
    localStorage.setItem(
      "fixture.conflicts",
      JSON.stringify([
        {
          key: "N.md",
          kind: "content",
          base: { path: "N.md", text: "base", size: 4 },
          local: { path: "N.md", text: "本地内容", size: 12 },
          remote: { path: "N.md", text: "远程内容", size: 12 },
          localFiles: [
            { path: "N.md", text: "本地内容", size: 12 },
            { path: "N.assets/image.png", text: null, size: 128 },
          ],
        },
        {
          key: "Gone.md",
          kind: "deleteModify",
          base: { path: "Gone.md", text: "old", size: 3 },
          local: null,
          remote: { path: "Gone.md", text: "保留修改", size: 12 },
        },
      ]),
    );
  });
  await page.reload();
  await go(page, "同步");
  const note = page
    .locator(".conflict-item")
    .filter({ has: page.getByRole("heading", { name: "N.md", exact: true }) });
  await note.getByText("本地版本", { exact: true }).click();
  await expect(note).toContainText("本地内容");
  await expect(note).toContainText("N.assets/image.png · 128 B");
  await note.getByRole("button", { name: "保留两份", exact: true }).click();
  await page.reload();
  await go(page, "同步");
  await expect(page.locator(".conflict-item")).toHaveCount(1);
  await expect(page.locator(".conflict-item")).toContainText("Gone.md");
  await page.getByRole("button", { name: "使用远程", exact: true }).click();
  await expect(
    page.getByText("选择已记录，再次同步以完成合并并推送。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "立即同步", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "已同步" }),
  ).toBeVisible();
});

test("new local edits immediately clear a previous synced status", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "创建笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记名称" }).fill("同步状态");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记正文" }).fill("旧内容");
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await go(page, "同步");
  await saveTestedSync(page);
  await page.getByRole("button", { name: "立即同步", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "已同步" }),
  ).toBeVisible();
  await go(page, "工作区");
  await page.getByRole("button", { name: "同步状态 我的工作区" }).click();
  await page.getByRole("textbox", { name: "笔记正文" }).fill("新内容尚未同步");
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await go(page, "同步");
  await expect(
    page.getByRole("status").filter({ hasText: "有待同步的本地修改" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "已同步" }),
  ).toHaveCount(0);
});

async function seedTree(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem(
      "fixture.folders",
      JSON.stringify(["项目", "项目/子项"]),
    );
    localStorage.setItem(
      "fixture.files",
      JSON.stringify({
        "项目/计划.md": {
          path: "项目/计划.md",
          body: "计划正文",
          revision: "r1",
          id: "plan",
        },
        "根笔记.md": {
          path: "根笔记.md",
          body: "根",
          revision: "r1",
          id: "root",
        },
      }),
    );
  });
  await page.reload();
}

test("compact drawer traps focus, closes with Escape and after navigation", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  const menu = page.getByRole("button", { name: "打开导航", exact: true });
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "导航" });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "工作区", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(menu).toBeFocused();
  await go(page, "设置");
  await expect(drawer).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "设置", exact: true, level: 1 }),
  ).toBeVisible();
});

test("wide layout docks the sidebar and remembers when it is collapsed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await nativeIpcFixture(page);
  await page.goto("/");
  await seedTree(page);
  const nav = page.getByRole("navigation", { name: "导航", exact: true });
  await expect(nav).toBeVisible();
  await expect(
    page.getByRole("button", { name: "打开导航", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("tree", { name: "工作区文件" })).toBeVisible();
  await page.getByRole("button", { name: "收起侧边栏", exact: true }).click();
  await expect(nav).toHaveCount(0);
  await page.reload();
  await expect(nav).toHaveCount(0);
  await page.getByRole("button", { name: "展开侧边栏", exact: true }).click();
  await expect(nav).toBeVisible();
});

test("file tree supports arrow keys, opens notes and creates inside a folder", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await nativeIpcFixture(page);
  await page.goto("/");
  await seedTree(page);
  const tree = page.getByRole("tree", { name: "工作区文件" });
  const folder = tree.getByRole("treeitem", { name: "项目", exact: true });
  await expect(tree.getByRole("treeitem")).toHaveCount(2);
  await folder.focus();
  await page.keyboard.press("ArrowRight");
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  const child = tree.getByRole("treeitem", { name: "子项", exact: true });
  await expect(child).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const plan = tree.getByRole("treeitem", { name: "计划", exact: true });
  await expect(plan).toBeFocused();
  await expect(plan).toHaveAttribute("aria-level", "2");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    "计划正文",
  );
  await expect(plan).toHaveAttribute("aria-selected", "true");
  await plan.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(folder).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await page
    .getByRole("button", { name: "文件操作: 项目", exact: true })
    .click();
  await page.getByRole("button", { name: "新建子文件夹", exact: true }).click();
  await expect(page.getByText("创建位置: 项目")).toBeVisible();
  await page.getByRole("textbox", { name: "文件夹名称" }).fill("归档");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(
    tree.getByRole("treeitem", { name: "归档", exact: true }),
  ).toHaveAttribute("aria-level", "2");
});

test("quick note saves into Inbox with a first-line name and joins recent notes", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "全部笔记" })).toBeVisible();
  const input = page.getByRole("textbox", { name: "快速笔记" });
  await input.fill("# 会议: 记录\n第二行");
  await input.press("ControlOrMeta+Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "已保存到 Inbox" }),
  ).toBeVisible();
  await expect(input).toHaveValue("");
  await input.fill("# 会议: 记录\n另一条");
  await page.getByRole("button", { name: "保存到 Inbox", exact: true }).click();
  const files = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fixture.files")!),
  );
  expect(files["Inbox/会议 记录.md"].body).toBe("# 会议: 记录\n第二行");
  expect(files["Inbox/会议 记录 2.md"].body).toBe("# 会议: 记录\n另一条");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("fixture.folders")!),
    ),
  ).toContain("Inbox");
  await expect(page.getByRole("heading", { name: "最近文档" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "会议 记录 2 Inbox", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "打开", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    "# 会议: 记录\n另一条",
  );
});

test("sync settings save only after a passing test and keep the stored token", async ({
  page,
}) => {
  await nativeIpcFixture(page);
  await page.goto("/");
  await go(page, "同步");
  const save = page.getByRole("button", { name: "保存同步设置" });
  const testButton = page.getByRole("button", {
    name: "测试连接",
    exact: true,
  });
  await page
    .getByRole("textbox", { name: "Git 远程地址" })
    .fill("https://git.example.test/notes.git");
  await page.getByRole("textbox", { name: "Git 用户名" }).fill("writer");
  await page.getByLabel("访问令牌／密码").fill("secret");
  await page.getByRole("textbox", { name: "提交者名称" }).fill("Writer");
  await page
    .getByRole("textbox", { name: "提交者邮箱" })
    .fill("writer@example.test");
  await expect(save).toBeDisabled();
  await expect(page.getByText("请先测试连接，通过后才能保存。")).toBeVisible();
  await testButton.click();
  await expect(page.getByText("连接可用")).toBeVisible();
  await expect(
    page.getByText("远程默认分支: main · 推送权限正常"),
  ).toBeVisible();
  await expect(save).toBeEnabled();
  await page
    .getByRole("textbox", { name: "提交者邮箱" })
    .fill("other@example.test");
  await expect(save).toBeDisabled();
  await expect(
    page.getByText("设置已修改，请重新测试连接后再保存。"),
  ).toBeVisible();
  await testButton.click();
  await save.click();
  await expect(
    page.getByRole("status").filter({ hasText: "同步设置已保存。" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("fixture.credentials")!),
    ),
  ).toEqual({ username: "writer", token: "secret" });

  await page.reload();
  await go(page, "同步");
  const token = page.getByLabel("访问令牌／密码");
  await expect(token).toHaveValue("");
  await expect(token).toHaveAttribute("placeholder", "已保存，留空保持不变");
  await expect(page.getByRole("textbox", { name: "Git 用户名" })).toHaveValue(
    "writer",
  );
  await expect(save).toBeDisabled();
  await testButton.click();
  const calls = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fixture.probeCalls")!),
  );
  expect(calls.at(-1)).toMatchObject({ username: "writer", token: "" });
  await expect(save).toBeEnabled();

  await page.evaluate(() =>
    localStorage.setItem(
      "fixture.probe",
      JSON.stringify({ error: "pushDenied" }),
    ),
  );
  await page.getByRole("textbox", { name: "Git 用户名" }).fill("reader");
  await testButton.click();
  await expect(page.getByRole("alert")).toContainText("没有推送权限");
  await expect(save).toBeDisabled();

  await page.getByRole("button", { name: "清除凭据", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "清除凭据", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "凭据已清除" }),
  ).toBeVisible();
  await expect(token).not.toHaveAttribute(
    "placeholder",
    "已保存，留空保持不变",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("fixture.credentials")),
  ).toBeNull();
});
