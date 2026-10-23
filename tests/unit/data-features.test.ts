import { test, expect } from "bun:test";
import { versionBody } from "../../src/features/history/HistoryPanel";
import { SyncScheduler } from "../../src/features/sync/scheduler";
test("history body extraction preserves Markdown and handles empty, CRLF, BOM headers", () => {
  expect(versionBody("---\n---\n# Empty header")).toBe("# Empty header");
  expect(versionBody("\ufeff---\r\nid: stable\r\n...\r\nbody\r\n")).toBe(
    "body\r\n",
  );
  expect(versionBody("# Plain\n---\nbody")).toBe("# Plain\n---\nbody");
});
test("sync scheduler honors edit idle, resume age, foreground polling and changes during sync", async () => {
  let now = 1000;
  let id = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const clock = {
    now: () => now,
    set: (run: () => void, delay: number) => {
      const n = ++id;
      timers.set(n, {
        at: now + delay,
        run: () => {
          timers.delete(n);
          run();
        },
      });
      return n;
    },
    clear: (n: number) => {
      timers.delete(n);
    },
  };
  const calls: string[] = [];
  let finish: () => void = () => {};
  const scheduler = new SyncScheduler(async (reason) => {
    calls.push(reason);
    if (reason === "idle")
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    return true;
  }, clock);
  scheduler.changed();
  now += 29999;
  await scheduler.resume();
  expect(calls).toEqual(["resume"]);
  scheduler.changed();
  const timer = [...timers.values()][0];
  expect(timer.at).toBe(now + 30000);
  now += 30000;
  timer.run();
  await Promise.resolve();
  scheduler.changed();
  finish();
  await Promise.resolve();
  await Promise.resolve();
  now += 100;
  await scheduler.resume();
  expect(calls).toContain("idle");
  expect(calls.at(-1)).toBe("resume");
  const count = calls.length;
  now += 1000;
  await scheduler.resume();
  expect(calls.length).toBe(count);
  now += 60001;
  await scheduler.resume();
  expect(calls.length).toBe(count + 1);
  now += 1000;
  await scheduler.poll();
  const afterPoll = calls.length;
  now += 1000;
  await scheduler.poll();
  expect(calls.length).toBe(afterPoll);
  scheduler.dispose();
  expect(timers.size).toBe(0);
});
