import { expect, test } from "bun:test";
import { fingerprint } from "../../src/features/sync/syncFingerprint";

test("fingerprint changes with any field and ignores surrounding spaces", () => {
  const base = {
    remote: "https://g/x.git",
    username: "u",
    token: "",
    name: "N",
    email: "e@x",
  };
  expect(fingerprint({ ...base, remote: " https://g/x.git " })).toBe(
    fingerprint(base),
  );
  for (const key of Object.keys(base) as (keyof typeof base)[])
    expect(fingerprint({ ...base, [key]: base[key] + "1" })).not.toBe(
      fingerprint(base),
    );
});
