import { expect, test } from "bun:test";
import {
  quickNoteName,
  withSuffix,
} from "../../src/features/workspace/quickNoteName";

const now = new Date(2026, 9, 22, 16, 5);

test("first line without Markdown markers becomes the name", () => {
  expect(quickNoteName("# 会议: 记录/要点\n正文", now, "快速笔记")).toBe(
    "会议 记录 要点",
  );
  expect(quickNoteName("- [ ] 买牛奶", now, "Quick note")).toBe("买牛奶");
  expect(quickNoteName("  > 引用  \n", now, "x")).toBe("引用");
  expect(quickNoteName("1. 第一步", now, "x")).toBe("第一步");
  expect(quickNoteName("\n\n* 第二行", now, "x")).toBe("第二行");
  expect(quickNoteName('a\t"b"<c>|d?', now, "x")).toBe("a b c d");
});

test("empty names fall back to a timestamp and long names are cut", () => {
  expect(quickNoteName("", now, "快速笔记")).toBe("快速笔记 2026-10-22 16-05");
  expect(quickNoteName("...", now, "快速笔记")).toBe(
    "快速笔记 2026-10-22 16-05",
  );
  expect(quickNoteName("###", now, "Quick note")).toBe(
    "Quick note 2026-10-22 16-05",
  );
  expect([...quickNoteName("字".repeat(80), now, "x")].length).toBe(60);
  expect(quickNoteName(`${"a".repeat(59)} b`, now, "x")).toBe("a".repeat(59));
});

test("collision suffixes", () => {
  expect(withSuffix("a", 1)).toBe("a");
  expect(withSuffix("a", 3)).toBe("a 3");
});
