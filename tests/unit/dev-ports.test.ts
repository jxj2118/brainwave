import { test, expect } from "bun:test";
import { assertDevPortsAvailable } from "../../scripts/check-dev-ports";

test("dev port preflight rejects an occupied port without stopping its service", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("existing-service"),
  });
  try {
    await expect(assertDevPortsAvailable([server.port!])).rejects.toThrow(
      String(server.port),
    );
    expect(await (await fetch(server.url)).text()).toBe("existing-service");
  } finally {
    await server.stop(true);
  }
});

test("dev port preflight also checks the websocket port and releases earlier probes", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("websocket-service"),
  });
  const unused = Bun.serve({ port: 0, fetch: () => new Response() });
  const freePort = unused.port!;
  await unused.stop(true);
  try {
    await expect(
      assertDevPortsAvailable([freePort, server.port!]),
    ).rejects.toThrow(String(server.port));
    await assertDevPortsAvailable([freePort]);
  } finally {
    await server.stop(true);
  }
  await assertDevPortsAvailable([freePort, server.port!]);
});
