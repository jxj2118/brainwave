import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve("scripts/check-public-files.ts");
async function git(root: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", "-C", root, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}
async function audit(root: string, ...args: string[]) {
  const child = Bun.spawn([process.execPath, script, ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    status: await child.exited,
    output: await new Response(child.stdout).text(),
    error: await new Response(child.stderr).text(),
  };
}
async function put(root: string, path: string, content = "source") {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), content);
  await git(root, "add", "--", path);
}

test("publication audit accepts source and rejects force-staged private documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "brainwave-publication-"));
  try {
    await git(root, "init", "-q");
    await put(root, "README.md", "# Brainwave");
    await put(root, "src/app.ts", "export const app = true;");
    await put(
      root,
      "src-tauri/CMakeLists.txt",
      "cmake_minimum_required(VERSION 3.22)",
    );
    expect((await audit(root)).status).toBe(0);
    for (const path of [
      "docs/BUILDING.md",
      "AGENTS.md",
      ".codex/session.jsonl",
      "src/private-notes.md",
      "src/dev-notes.txt",
      "src/session.rtf",
      "scripts/experiment.ipynb",
      "private-export.json",
      "src-tauri/target/app",
      "src/signing.p12",
    ]) {
      await put(root, path);
      const result = await audit(root);
      expect(result.status).toBe(1);
      expect(result.error).toContain(path);
      await git(root, "rm", "--cached", "--", path);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pre-push hook checks a detached commit pushed by SHA", async () => {
  const root = await mkdtemp(join(tmpdir(), "brainwave-publication-push-"));
  try {
    await git(root, "init", "-q");
    await git(root, "config", "user.name", "Publication fixture");
    await git(root, "config", "user.email", "fixture@example.invalid");
    await put(
      root,
      "package.json",
      JSON.stringify({
        scripts: { "check:public": "bun scripts/check-public-files.ts" },
      }),
    );
    await put(
      root,
      "scripts/check-public-files.ts",
      await Bun.file(script).text(),
    );
    await put(root, "README.md", "# Brainwave");
    await git(root, "commit", "--no-verify", "-qm", "fixture");
    await git(root, "switch", "--detach");
    await put(root, "docs/internal.md");
    await git(root, "commit", "--no-verify", "-qm", "private fixture");
    const commit = Bun.spawnSync(["git", "-C", root, "rev-parse", "HEAD"])
      .stdout.toString()
      .trim();
    await git(root, "switch", "-");
    expect((await audit(root, "--history")).status).toBe(0);
    const child = Bun.spawn([resolve(".githooks/pre-push")], {
      cwd: root,
      stdin: Buffer.from(
        `${commit} ${commit} refs/heads/preview ${"0".repeat(40)}\n`,
      ),
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await child.exited).toBe(1);
    expect(await new Response(child.stderr).text()).toContain(
      "docs/internal.md",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication audit inspects staged bytes rather than a cleaned working copy", async () => {
  const root = await mkdtemp(join(tmpdir(), "brainwave-publication-"));
  try {
    await git(root, "init", "-q");
    const privateHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    await put(root, "src/config.ts", privateHeader);
    await writeFile(join(root, "src/config.ts"), "clean working copy");
    const result = await audit(root);
    expect(result.status).toBe(1);
    expect(result.error).toContain("src/config.ts");
    expect(result.error).not.toContain(privateHeader);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication history audit rejects private files deleted before the latest commit", async () => {
  const root = await mkdtemp(join(tmpdir(), "brainwave-publication-"));
  try {
    await git(root, "init", "-q");
    await git(root, "config", "user.name", "Publication fixture");
    await git(root, "config", "user.email", "fixture@example.invalid");
    await put(root, "docs/notes.md");
    await git(root, "commit", "--no-verify", "-qm", "fixture");
    await git(root, "rm", "--", "docs/notes.md");
    await put(root, "README.md", "# Brainwave");
    await git(root, "commit", "--no-verify", "-qm", "remove fixture");
    expect((await audit(root)).status).toBe(0);
    const history = await audit(root, "--history");
    expect(history.status).toBe(1);
    expect(history.error).toContain("docs/notes.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("configured commit hook blocks a private first commit", async () => {
  const root = await mkdtemp(join(tmpdir(), "brainwave-publication-hook-"));
  try {
    await git(root, "init", "-q");
    await git(root, "config", "user.name", "Publication fixture");
    await git(root, "config", "user.email", "fixture@example.invalid");
    await git(root, "config", "core.hooksPath", resolve(".githooks"));
    await put(
      root,
      "package.json",
      JSON.stringify({
        scripts: { "check:public": "bun scripts/check-public-files.ts" },
      }),
    );
    await put(
      root,
      "scripts/check-public-files.ts",
      await Bun.file(script).text(),
    );
    await put(root, "docs/internal.md");
    const blocked = Bun.spawnSync(
      ["git", "-C", root, "commit", "-qm", "fixture"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(blocked.exitCode).not.toBe(0);
    expect(blocked.stderr.toString()).toContain("docs/internal.md");
    expect(
      Bun.spawnSync(["git", "-C", root, "rev-parse", "--verify", "HEAD"])
        .exitCode,
    ).not.toBe(0);
    await git(root, "rm", "--cached", "--", "docs/internal.md");
    await git(root, "commit", "-qm", "fixture");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
