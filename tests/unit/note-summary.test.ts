import { expect, test } from "bun:test";
import { noteSummary } from "../../src/features/workspace/noteSummary";
test("note cards separate Markdown blocks and preserve complete Unicode characters", () => {
  expect(noteSummary("# A heading\n\nA paragraph\n\n- A list item")).toBe(
    "A heading A paragraph A list item",
  );
  expect(noteSummary("🌱".repeat(200))).toBe("🌱".repeat(180));
});
