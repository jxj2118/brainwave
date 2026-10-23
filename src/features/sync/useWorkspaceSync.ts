import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SyncStorage,
  SyncStatus,
  SyncConfiguration,
  StoredCredentials,
} from "../../platform/contracts";
import { errorCode } from "../../platform/contracts";
import { isForeground, onForeground } from "../../platform/environment";
import { SyncScheduler } from "./scheduler";
export function useWorkspaceSync(
  storage: SyncStorage | undefined,
  beforeRun: () => Promise<void>,
  afterRun: () => Promise<void>,
  blocked: boolean,
) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const [credentials, setCredentials] = useState<StoredCredentials | null>(
    null,
  );
  const state = useRef({ status, error, blocked, beforeRun, afterRun });
  state.current = { status, error, blocked, beforeRun, afterRun };
  const inFlight = useRef<Promise<boolean> | null>(null);
  const generation = useRef(0);
  const run = useCallback(
    (automatic = false): Promise<boolean> => {
      if (inFlight.current) return inFlight.current;
      if (!storage || state.current.blocked) return Promise.resolve(false);
      if (
        automatic &&
        (!isForeground() ||
          !state.current.status?.configuration.remote ||
          state.current.status.phase === "conflict" ||
          errorCode(state.current.error) === "authenticationRequired")
      )
        return Promise.resolve(false);
      setRunning(true);
      setError(null);
      const started = generation.current;
      const task = (async () => {
        try {
          await state.current.beforeRun();
          const next = await storage.run();
          await state.current.afterRun();
          const completed =
            started === generation.current ? next : await storage.status();
          setStatus(completed);
          if (completed.phase === "synced") scheduler.current?.succeeded();
          return completed.phase === "synced";
        } catch (e) {
          setError(e);
          try {
            setStatus(await storage.status());
          } catch {}
          return false;
        } finally {
          setRunning(false);
          inFlight.current = null;
        }
      })();
      inFlight.current = task;
      return task;
    },
    [storage],
  );
  const scheduler = useRef<SyncScheduler | null>(null);
  useEffect(() => {
    if (!storage) return;
    let active = true;
    const next = new SyncScheduler(() => run(true));
    scheduler.current = next;
    void storage.status().then(
      (value) => {
        if (active) {
          setStatus(value);
          state.current.status = value;
          void next.opened();
        }
      },
      (e) => {
        if (active) setError(e);
      },
    );
    void storage.credentials().then(
      (value) => {
        if (active) setCredentials(value);
      },
      () => {},
    );
    const unsubscribe = onForeground(() => {
      void next.resume();
    });
    const timer = setInterval(() => {
      void next.poll();
    }, 300_000);
    return () => {
      active = false;
      next.dispose();
      unsubscribe();
      clearInterval(timer);
      scheduler.current = null;
    };
  }, [storage, run]);
  const changed = useCallback(() => {
    generation.current++;
    scheduler.current?.changed();
    setStatus((previous) =>
      previous && previous.configuration.remote && previous.phase !== "conflict"
        ? { ...previous, phase: "localChanges" }
        : previous,
    );
  }, []);
  async function configure(
    value: SyncConfiguration,
    username: string,
    token: string,
  ) {
    if (!storage || inFlight.current) return;
    await storage.configure(value, username, token);
    setStatus(await storage.status());
    setCredentials(await storage.credentials());
    setError(null);
  }
  async function test(remote: string, username: string, token: string) {
    if (!storage) throw { code: "io" };
    return storage.test(remote, username, token);
  }
  async function clearCredentials() {
    if (!storage || inFlight.current) return;
    await storage.clearCredentials();
    setCredentials(await storage.credentials());
  }
  async function resolve(key: string, choice: "local" | "remote" | "both") {
    if (!storage || inFlight.current) return;
    await state.current.beforeRun();
    setStatus(await storage.resolve(key, choice));
    setError(null);
  }
  return {
    status,
    error,
    running,
    credentials,
    run,
    changed,
    configure,
    resolve,
    test,
    clearCredentials,
  };
}
