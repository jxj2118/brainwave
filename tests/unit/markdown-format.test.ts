import { test, expect } from "bun:test";
import { formatMarkdown } from "../../src/features/notes/markdownFormat";

const apply = (
  body: string,
  start: number,
  end: number,
  kind: Parameters<typeof formatMarkdown>[3],
) => {
  const edit = formatMarkdown(body, start, end, kind);
  return {
    body: body.slice(0, edit.from) + edit.text + body.slice(edit.to),
    selected: (
      body.slice(0, edit.from) +
      edit.text +
      body.slice(edit.to)
    ).slice(edit.selectionStart, edit.selectionEnd),
  };
};

test("heading cycles through levels on the caret line only", () => {
  expect(apply("a\nTitle\nb", 3, 3, "heading").body).toBe("a\n# Title\nb");
  expect(apply("# Title", 2, 2, "heading").body).toBe("## Title");
  expect(apply("### Title", 5, 5, "heading").body).toBe("Title");
});

test("list prefixes toggle across every selected line", () => {
  expect(apply("one\ntwo", 0, 7, "bulletList").body).toBe("- one\n- two");
  expect(apply("- one\n- two", 0, 11, "bulletList").body).toBe("one\ntwo");
  expect(apply("- one", 0, 0, "taskList").body).toBe("- [ ] one");
  expect(apply("- [x] done", 0, 0, "taskList").body).toBe("done");
  expect(apply("text", 2, 2, "quote").body).toBe("> text");
});

test("inline code wraps a single-line selection, fences span lines", () => {
  expect(apply("call fn now", 5, 7, "code")).toEqual({
    body: "call `fn` now",
    selected: "fn",
  });
  expect(apply("a\nb", 0, 3, "code").body).toBe("```\na\nb\n```");
});

test("link keeps selected text as label and selects the address", () => {
  expect(apply("see docs", 4, 8, "link")).toEqual({
    body: "see [docs](https://)",
    selected: "https://",
  });
  expect(apply("", 0, 0, "link").body).toBe("[](https://)");
});

test("edits touch only the affected range", () => {
  const edit = formatMarkdown("keep\nline\nkeep", 6, 6, "quote");
  expect([edit.from, edit.to, edit.text]).toEqual([5, 9, "> line"]);
});
