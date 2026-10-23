import { test, expect } from "bun:test";
import { normalizePreferences } from "../../src/app/preferences";
test("corrupt but valid JSON cannot prevent startup; valid choices survive", () => {
  for (const raw of [
    null,
    42,
    true,
    "x",
    [],
    { locale: "xx", theme: "sepia" },
  ]) {
    expect(normalizePreferences(raw, "zh-CN")).toEqual({
      locale: "zh-CN",
      theme: "system",
    });
  }
  expect(
    normalizePreferences({ locale: "en", theme: "dark" }, "zh-CN"),
  ).toEqual({ locale: "en", theme: "dark" });
});
