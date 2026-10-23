export type SyncReason = "open" | "idle" | "resume" | "poll";
interface Clock {
  now(): number;
  set(run: () => void, delay: number): number;
  clear(id: number): void;
}
const systemClock: Clock = {
  now: Date.now,
  set: (run, delay) => setTimeout(run, delay) as unknown as number,
  clear: (id) => clearTimeout(id),
};
export class SyncScheduler {
  private lastSuccess = 0;
  private lastPoll = -Infinity;
  private generation = 0;
  private savedGeneration = 0;
  private timer: number | null = null;
  private running = false;
  private disposed = false;
  constructor(
    private run: (reason: SyncReason) => Promise<boolean>,
    private clock: Clock = systemClock,
  ) {}
  changed() {
    this.generation++;
    if (this.timer !== null) this.clock.clear(this.timer);
    this.timer = this.clock.set(() => {
      this.timer = null;
      void this.request("idle");
    }, 30_000);
  }
  succeeded() {
    this.lastSuccess = this.clock.now();
    this.savedGeneration = this.generation;
  }
  opened() {
    return this.request("open");
  }
  async resume() {
    if (
      this.generation !== this.savedGeneration ||
      this.clock.now() - this.lastSuccess > 60_000
    )
      await this.request("resume");
  }
  async poll() {
    if (this.clock.now() - this.lastPoll < 300_000) return;
    this.lastPoll = this.clock.now();
    await this.request("poll");
  }
  private async request(reason: SyncReason) {
    if (this.running || this.disposed) return;
    this.running = true;
    const generation = this.generation;
    try {
      if (await this.run(reason)) {
        this.lastSuccess = this.clock.now();
        this.savedGeneration = Math.max(this.savedGeneration, generation);
      }
    } finally {
      this.running = false;
    }
  }
  dispose() {
    this.disposed = true;
    if (this.timer !== null) this.clock.clear(this.timer);
  }
}
