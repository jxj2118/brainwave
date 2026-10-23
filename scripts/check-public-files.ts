import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const arguments_ = process.argv.slice(2);
const history = arguments_.includes("--history");
const worktree = arguments_.includes("--worktree");
const push = arguments_.includes("--pre-push");
if (
  arguments_.some(
    (arg) => !["--history", "--worktree", "--pre-push"].includes(arg),
  ) ||
  [history, worktree, push].filter(Boolean).length > 1
) {
  console.error(
    "Usage: bun run check:public [--history | --worktree | --pre-push]",
  );
  process.exit(1);
}
function git(...args: string[]): Buffer {
  const child = Bun.spawnSync(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (child.exitCode !== 0)
    throw new Error(`Git could not inspect publication files (${args[0]}).`);
  return Buffer.from(child.stdout);
}
const failures = new Set<string>();
const inspected = new Set<string>();
const rootFiles = new Set([
  ".gitignore",
  ".gitattributes",
  "README.md",
  "README.zh-CN.md",
  "LICENSE",
  "package.json",
  "bun.lock",
  "bunfig.toml",
  "index.html",
  "vite.config.ts",
  "tsconfig.json",
  "tsconfig.node.json",
  "playwright.config.ts",
]);
const sourceRoots = new Set([
  "src",
  "src-tauri",
  "crates",
  "scripts",
  "tests",
  "public",
  ".github",
  ".githooks",
]);
const privateSegments = new Set([
  "docs",
  "doc",
  "documentation",
  "target",
  "build",
  "dist",
  "dist-ssr",
  "node_modules",
  "release",
  "coverage",
  "test-results",
  "playwright-report",
  "logs",
  "prompts",
  "specs",
  "plans",
  ".git",
  ".idea",
  ".vscode",
  ".gradle",
  ".tauri",
  ".cache",
  ".superpowers",
  ".codex",
  ".claude",
  ".agents",
  ".agent",
  ".cursor",
  ".windsurf",
  ".gemini",
  ".continue",
  ".opencode",
  ".cline",
  ".roo",
]);
function reject(path: string, reason: string) {
  failures.add(`${JSON.stringify(path)}: ${reason}`);
}
function allowed(path: string): boolean {
  const parts = path.split("/");
  const lower = path.toLowerCase();
  if (
    /[\r\n\t]/.test(path) ||
    parts.some((part) => privateSegments.has(part.toLowerCase()))
  ) {
    reject(path, "private or generated path");
    return false;
  }
  if (parts.length === 1 && !rootFiles.has(path)) {
    reject(path, "root file is not approved for publication");
    return false;
  }
  if (parts.length > 1 && !sourceRoots.has(parts[0])) {
    reject(path, "directory is not approved for publication");
    return false;
  }
  const name = parts[parts.length - 1].toLowerCase();
  if (
    (/\.(md|mdx|markdown|rst|adoc|org|pdf|docx?|pptx?|odt|odp|rtf|ipynb)$/i.test(
      path,
    ) &&
      !["README.md", "README.zh-CN.md"].includes(path)) ||
    (name.endsWith(".txt") &&
      name !== "cmakelists.txt" &&
      !/^requirements.*\.txt$/.test(name)) ||
    /\.(jks|keystore|p12|pfx|pem|key|mobileprovision|apk|aab|ipa|dmg|exe|msi|so|a|dylib|db|sqlite3?|log|jsonl|tsbuildinfo|local)$/i.test(
      path,
    ) ||
    name.startsWith(".env") ||
    [
      "agents.md",
      "claude.md",
      "gemini.md",
      "keystore.properties",
      "key.properties",
      "local.properties",
      ".ds_store",
      "mcp.json",
      ".mcp.json",
    ].includes(name) ||
    path.startsWith("src-tauri/gen/apple/Externals/") ||
    lower.includes("/jnilibs/")
  ) {
    reject(path, "private document, credential, or generated artifact");
    return false;
  }
  return true;
}
function inspect(path: string, mode: string, id: string, read: () => Buffer) {
  if (!allowed(path)) return;
  if (mode === "120000" || mode === "160000") {
    reject(
      path,
      "symlinks and nested repositories require explicit publication review",
    );
    return;
  }
  if (inspected.has(id)) return;
  inspected.add(id);
  const content = read();
  if (content.length > 16 * 1024 * 1024) {
    reject(path, "oversized file; publish installers as Release assets");
    return;
  }
  if (content.includes(0)) return;
  const text = content.toString("utf8");
  if (
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/.test(text) ||
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/.test(
      text,
    )
  ) {
    reject(path, "credential material detected");
  }
  if (/\/(?:Users|home)\/[A-Za-z0-9_.-]+\//.test(text)) {
    reject(path, "machine-specific home directory detected");
  }
}
function tree(ref?: string) {
  const raw = ref
    ? git("ls-tree", "-r", "-z", ref)
    : git("ls-files", "--stage", "-z");
  for (const entry of raw.toString("utf8").split("\0").filter(Boolean)) {
    const separator = entry.indexOf("\t");
    const path = entry.slice(separator + 1);
    const [mode, typeOrHash, hashOrStage] = entry
      .slice(0, separator)
      .split(" ");
    const hash = ref ? hashOrStage : typeOrHash;
    if (!ref && hashOrStage !== "0") {
      reject(path, "unmerged index entry");
      continue;
    }
    inspect(path, mode, hash, () => git("cat-file", "blob", hash));
  }
}
try {
  process.chdir(git("rev-parse", "--show-toplevel").toString("utf8").trim());
  if (history || push) {
    const targets: string[] = [];
    if (push) {
      for (const record of readFileSync(0, "utf8")
        .split("\n")
        .filter(Boolean)) {
        const fields = record.trim().split(/\s+/);
        const object = fields[1];
        if (
          fields.length !== 4 ||
          !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(object)
        ) {
          throw new Error("Invalid pre-push object record.");
        }
        if (!/^0+$/.test(object)) targets.push(object);
      }
    }
    const revisions = history
      ? git("rev-list", "--all")
      : targets.length
        ? git("rev-list", ...targets)
        : Buffer.alloc(0);
    for (const commit of revisions
      .toString("utf8")
      .trim()
      .split("\n")
      .filter(Boolean))
      tree(commit);
  } else if (worktree) {
    const paths = new Set(
      git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
        .toString("utf8")
        .split("\0")
        .filter(Boolean),
    );
    for (const path of paths) {
      const fullPath = resolve(path);
      const info = lstatSync(fullPath);
      inspect(path, info.isSymbolicLink() ? "120000" : "100644", path, () =>
        readFileSync(fullPath),
      );
    }
  } else tree();
  if (failures.size) {
    console.error("Publication check failed:\n" + [...failures].join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      `Publication check passed (${inspected.size} file contents inspected).`,
    );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Publication check failed.",
  );
  process.exitCode = 1;
}
