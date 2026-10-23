import { createServer } from "node:net";

export async function assertDevPortsAvailable(ports: readonly number[]) {
  for (const port of ports) {
    const server = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen({ host: "127.0.0.1", port, exclusive: true }, resolve);
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "unknown";
      throw new Error(
        `Android: Development port ${port} is unavailable (${code}).\n` +
          "A development server may already be running. Stop it with Ctrl+C in its original terminal, then run bun run android again.\n" +
          `To identify the listener on macOS: lsof -nP -iTCP:${port} -sTCP:LISTEN\n` +
          "No existing process has been stopped.",
      );
    } finally {
      if (server.listening)
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

if (import.meta.main) {
  try {
    await assertDevPortsAvailable([1420, 1421]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
