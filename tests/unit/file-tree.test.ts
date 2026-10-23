import { expect, test } from "bun:test";
import {
  ancestors,
  buildTree,
  visibleNodes,
} from "../../src/features/navigation/treeModel";
import type { Entry } from "../../src/platform/contracts";

const e = (path: string, kind: Entry["kind"], issue?: string): Entry => ({
  path,
  name: path.split("/").at(-1)!.replace(/\.md$/, ""),
  kind,
  id: null,
  identityCollision: false,
  issue,
});

test("nests entries with folders first and numeric-aware names", () => {
  const tree = buildTree(
    [
      e("b.md", "note"),
      e("Z", "folder"),
      e("Z/n10.md", "note"),
      e("Z/n2.md", "note"),
      e("a", "folder"),
    ],
    "en",
  );
  expect(tree.map((n) => n.entry.path)).toEqual(["a", "Z", "b.md"]);
  expect(tree[1].children.map((n) => n.entry.path)).toEqual([
    "Z/n2.md",
    "Z/n10.md",
  ]);
});

test("notes whose folders were not scanned attach to synthesized folders", () => {
  const tree = buildTree([e("x/y/n.md", "note")], "en");
  expect(tree[0].entry).toMatchObject({ path: "x", kind: "folder" });
  expect(tree[0].children[0].entry).toMatchObject({
    path: "x/y",
    kind: "folder",
  });
  expect(tree[0].children[0].children[0].entry.path).toBe("x/y/n.md");
});

test("entries with issues keep their issue", () => {
  const tree = buildTree([e("bad.md", "note", "unreadable")], "en");
  expect(tree[0].entry.issue).toBe("unreadable");
});

test("ancestors and visible rows respect expansion", () => {
  expect(ancestors("a/b/c.md")).toEqual(["a", "a/b"]);
  expect(ancestors("c.md")).toEqual([]);
  const tree = buildTree(
    [e("a", "folder"), e("a/n.md", "note"), e("r.md", "note")],
    "en",
  );
  expect(visibleNodes(tree, new Set()).map((r) => r.node.entry.path)).toEqual([
    "a",
    "r.md",
  ]);
  expect(
    visibleNodes(tree, new Set(["a"])).map((r) => [
      r.node.entry.path,
      r.depth,
      r.parent,
    ]),
  ).toEqual([
    ["a", 0, null],
    ["a/n.md", 1, "a"],
    ["r.md", 0, null],
  ]);
});
