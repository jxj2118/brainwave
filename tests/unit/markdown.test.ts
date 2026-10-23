import { test, expect } from "bun:test";
import { headings } from "../../src/features/notes/MarkdownView";
test("outline recognizes setext and formatted headings with editor line locations", () => {
  expect(headings("Title\n=====\n\n## **Next** `step`\ntext")).toEqual([
    { level: 1, text: "Title", line: 1 },
    { level: 2, text: "Next step", line: 4 },
  ]);
});
test("shorter nested fences do not expose code contents as outline headings", () => {
  expect(headings("````\n```\n# inside code\n````\n# Real")).toEqual([
    { level: 1, text: "Real", line: 5 },
  ]);
});
