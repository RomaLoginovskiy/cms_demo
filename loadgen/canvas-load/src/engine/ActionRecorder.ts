export interface ActionRecord {
  ts: string;
  profile: string;
  action: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export class ActionRecorder {
  private readonly buffer: ActionRecord[] = [];
  private readonly maxSize = 100;
  private total = 0;
  private failed = 0;
  private readonly durations: number[] = [];

  constructor(private readonly onRecord?: (r: ActionRecord) => void) {}

  async record<T>(
    profile: string,
    action: string,
    fn: () => Promise<T>,
    opts?: { chaos?: boolean }
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.push({
        ts: new Date().toISOString(),
        profile,
        action,
        durationMs: Date.now() - start,
        ok: true
      }, opts?.chaos);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.push(
        {
          ts: new Date().toISOString(),
          profile,
          action,
          durationMs: Date.now() - start,
          ok: false,
          error: message
        },
        opts?.chaos
      );
      throw err;
    }
  }

  private push(record: ActionRecord, chaos = false): void {
    if (!chaos) {
      this.total++;
      if (!record.ok) this.failed++;
      this.durations.push(record.durationMs);
      if (this.durations.length > 1000) this.durations.shift();
    }
    this.buffer.push(record);
    if (this.buffer.length > this.maxSize) this.buffer.shift();
    this.onRecord?.(record);
  }

  getRecent(): ActionRecord[] {
    return [...this.buffer];
  }

  getErrorRate(): number {
    if (this.total === 0) return 0;
    return this.failed / this.total;
  }

  getCounters(): { actionsTotal: number; actionsFailed: number } {
    return { actionsTotal: this.total, actionsFailed: this.failed };
  }

  reset(): void {
    this.buffer.length = 0;
    this.total = 0;
    this.failed = 0;
    this.durations.length = 0;
  }

  getLatencyPercentiles(): { p50: number; p95: number } {
    if (this.durations.length === 0) return { p50: 0, p95: 0 };
    const sorted = [...this.durations].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    return { p50, p95 };
  }
}

export class GlobalMetricsCollector {
  private static instance: GlobalMetricsCollector;
  private readonly recorders: ActionRecorder[] = [];
  pageErrors = 0;
  chaosActions = 0;

  static getInstance(): GlobalMetricsCollector {
    if (!GlobalMetricsCollector.instance) {
      GlobalMetricsCollector.instance = new GlobalMetricsCollector();
    }
    return GlobalMetricsCollector.instance;
  }

  register(recorder: ActionRecorder): void {
    this.recorders.push(recorder);
  }

  resetMetrics(): void {
    this.pageErrors = 0;
    this.chaosActions = 0;
    for (const r of this.recorders) {
      r.reset();
    }
    this.recorders.length = 0;
  }

  aggregate(): {
    actionsTotal: number;
    actionsFailed: number;
    errorRate: number;
    latencyMs: { p50: number; p95: number };
    recentErrors: ActionRecord[];
  } {
    let actionsTotal = 0;
    let actionsFailed = 0;
    const allRecent: ActionRecord[] = [];
    const allDurations: number[] = [];

    for (const r of this.recorders) {
      const c = r.getCounters();
      actionsTotal += c.actionsTotal;
      actionsFailed += c.actionsFailed;
      allRecent.push(...r.getRecent().filter(x => !x.ok));
    }

    allRecent.sort((a, b) => b.ts.localeCompare(a.ts));

    return {
      actionsTotal,
      actionsFailed,
      errorRate: actionsTotal === 0 ? 0 : actionsFailed / actionsTotal,
      latencyMs: this.recorders[0]?.getLatencyPercentiles() ?? { p50: 0, p95: 0 },
      recentErrors: allRecent.slice(0, 10)
    };
  }
}
