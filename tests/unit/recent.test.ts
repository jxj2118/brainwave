import { expect, test } from "bun:test";
import {
  moveRecent,
  removeRecent,
  touchRecent,
} from "../../src/features/workspace/recent";

test("touch dedupes, orders newest first and caps", () => {
  let list = touchRecent([], "a.md", 1);
  list = touchRecent(list, "b.md", 2);
  list = touchRecent(list, "a.md", 3);
  expect(list).toEqual([
    { path: "a.md", at: 3 },
    { path: "b.md", at: 2 },
  ]);
  expect(touchRecent(list, "c.md", 4, 2).map((r) => r.path)).toEqual([
    "c.md",
    "a.md",
  ]);
});

test("moves rewrite files and folder prefixes; removals cover folders", () => {
  const list = [
    { path: "f/a.md", at: 2 },
    { path: "fx.md", at: 1 },
  ];
  expect(moveRecent(list, "f", "g/f").map((r) => r.path)).toEqual([
    "g/f/a.md",
    "fx.md",
  ]);
  expect(moveRecent(list, "fx.md", "y.md").map((r) => r.path)).toEqual([
    "f/a.md",
    "y.md",
  ]);
  expect(removeRecent(list, "f").map((r) => r.path)).toEqual(["fx.md"]);
  expect(removeRecent(list, "fx.md").map((r) => r.path)).toEqual(["f/a.md"]);
});
