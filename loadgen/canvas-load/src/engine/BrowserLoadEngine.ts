import fs from 'fs';
import path from 'path';
import { Browser, chromium } from 'playwright';
import { LoadConfig, EnginePhase } from '../config/types';
import { parseDurationMs } from '../config/loadConfig';
import { applyScenarioSafe } from '../config/scenarios';
import { applyResolvedTarget, coerceTargetUrl } from '../config/resolveTargetUrl';
import { validateConfig } from '../config/validate';
import { normalizeUsers } from '../config/usersConfig';
import { resolveShard, isControlShard } from '../config/shard';
import { planUsersForShard, UserShardPlan } from '../config/userSharding';
import { isInClusterFlag } from '../config/runtime';
import {
  buildDisabledRumBatch,
  buildRumBatchForPreset,
  buildRumBatchForScenario,
  ApplyRumScenarioOptions
} from '../rum/rumControl';
import { RUM_DEMO_BATCH_PRESETS, RUM_DEMO_SCENARIOS } from '../rum/rumDemoCatalog';
import { ActionRecorder } from './ActionRecorder';
import { BoardListPage } from '../pages/BoardListPage';
import { cleanupBoardsViaRest } from '../cleanup/restCleanup';
import { probeCms } from '../behaviors/mediaPlacer';
import { GlobalMetricsCollector } from './ActionRecorder';
import { BoardResolver } from './BoardResolver';
import { VirtualBrowserUser } from './VirtualBrowserUser';
import {
  contextsActive,
  frontendProbe,
  cmsProbe,
  runInfo,
  setEnginePhaseMetric
} from '../metrics/prometheus';
import { probeFrontend, waitForFrontend } from './probes';
import { evaluateAbortCondition } from './abortPolicy';

export class BrowserLoadEngine {
  private config: LoadConfig;
  private phase: EnginePhase = 'idle';
  private browser: Browser | null = null;
  private readonly users = new Map<number, VirtualBrowserUser>();
  private targetCount = 0;
  private boardResolver: BoardResolver;
  private readonly startedAt = new Date().toISOString();
  private warmupComplete = false;
  private degraded = false;
  private paused = false;
  private durationTimer: NodeJS.Timeout | null = null;
  private reportTimer: NodeJS.Timeout | null = null;
  private probeTimer: NodeJS.Timeout | null = null;
  private abortMonitor: NodeJS.Timeout | null = null;
  private frontendReachable = false;
  private cmsReachable = true;
  private statusMessage = 'Checking canvas-frontend…';
  private rampInProgress = false;
  private userShardPlan: UserShardPlan;

  constructor(config: LoadConfig) {
    this.config = config;
    this.boardResolver = new BoardResolver(config);
    this.userShardPlan = this.applyShardPlan();
  }

  private applyShardPlan(): UserShardPlan {
    const shard = resolveShard(this.config.shard?.count);
    this.config.shard = { count: shard.count };
    const plan = planUsersForShard(this.config.users.count, shard.index, shard.count);
    this.targetCount = plan.localCount;
    this.config.users.max_contexts_per_pod = Math.max(
      this.config.users.max_contexts_per_pod,
      plan.localCount
    );
    return plan;
  }

  getShardPlan(): UserShardPlan {
    return this.userShardPlan;
  }

  isControlPlane(): boolean {
    return isControlShard(resolveShard(this.config.shard?.count));
  }

  getConfig(): LoadConfig {
    return this.config;
  }

  getPhase(): EnginePhase {
    return this.phase;
  }

  isPaused(): boolean {
    return this.paused;
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  isInCluster(): boolean {
    return isInClusterFlag();
  }

  getActiveContexts(): number {
    return this.users.size;
  }

  getTargetContexts(): number {
    return this.targetCount;
  }

  getTotalTargetUsers(): number {
    return this.userShardPlan.totalUsers;
  }

  getStartedAt(): string {
    return this.startedAt;
  }

  async start(): Promise<void> {
    if (this.phase !== 'idle' && this.phase !== 'stopped') return;

    const resolved = applyResolvedTarget(this.config);
    if (resolved.rewrittenFrom) {
      console.warn(
        `Target rewritten ${resolved.rewrittenFrom} → ${resolved.url} (${resolved.source})`
      );
    }

    this.browser = await chromium.launch({
      headless: this.config.browser.headless,
      slowMo: this.config.browser.slow_mo_ms
    });

    runInfo.set(
      { run_id: this.config.run.run_id!, scenario: this.config.run.scenario ?? 'default' },
      1
    );

    setTimeout(() => {
      this.warmupComplete = true;
    }, parseDurationMs(this.config.abort.warmup) ?? 15000);

    const durationMs = parseDurationMs(this.config.run.duration);
    if (durationMs) {
      this.durationTimer = setTimeout(() => void this.stop(), durationMs);
    }

    this.startReportLoop();
    void this.runProbeOnce();
    this.startProbeLoop();
    this.startAbortMonitor();

    if (this.config.run.paused) {
      this.paused = true;
      this.setPhase('paused');
      this.statusMessage = this.clusterHint(
        'Paused. Verify target URL, then click Resume.'
      );
      return;
    }

    await this.beginLoadIfTargetReady();
  }

  async reconfigureTarget(url: string): Promise<void> {
    await this.pause();

    const coerced = coerceTargetUrl(url);
    this.config.target.frontend_base_url = coerced;
    const resolved = applyResolvedTarget(this.config);
    if (resolved.rewrittenFrom) {
      console.warn(
        `Target rewritten ${resolved.rewrittenFrom} → ${resolved.url} (${resolved.source})`
      );
    }

    const errors = validateConfig(this.config);
    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }

    this.boardResolver = new BoardResolver(this.config);
    this.boardResolver.resetBoardState();
    for (const u of this.users.values()) {
      u.updateConfig(this.config);
    }

    GlobalMetricsCollector.getInstance().resetMetrics();
    this.degraded = false;

    await this.runProbeOnce();

    const effective = this.config.target.frontend_base_url;
    if (this.frontendReachable) {
      this.statusMessage = `Target OK at ${effective} — click Resume`;
    } else {
      this.statusMessage = this.clusterHint(`Target not reachable at ${effective}`);
    }
  }

  private clusterHint(msg: string): string {
    if (!isInClusterFlag()) return msg;
    return `${msg} (in cluster use http://canvas-frontend, not localhost)`;
  }

  private async beginLoadIfTargetReady(): Promise<void> {
    const url = this.config.target.frontend_base_url;
    this.statusMessage = `Waiting for canvas-frontend at ${url}…`;
    this.setPhase('idle');

    const ready = await waitForFrontend(url, 120_000);
    if (!ready) {
      this.paused = true;
      this.setPhase('paused');
      this.statusMessage = this.clusterHint(
        `Canvas frontend not reachable at ${url}`
      );
      console.error(this.statusMessage);
      return;
    }

    this.frontendReachable = true;
    frontendProbe.set(1);
    this.statusMessage = 'Target ready';
    await this.rampTo(this.targetCount);
  }

  async stop(): Promise<void> {
    this.setPhase('ramping_down');
    await this.rampTo(0);
    if (this.config.run.cleanup && this.isControlPlane()) {
      await cleanupBoardsViaRest(this.config);
      if (this.browser) {
        const ctx = await this.browser.newContext();
        const page = await ctx.newPage();
        const list = new BoardListPage(
          page,
          this.config.target.frontend_base_url,
          new ActionRecorder()
        );
        try {
          await list.deleteBoardsMatching(this.config.boards.name_prefix);
        } catch {
          /* ui cleanup best effort */
        }
        await ctx.close();
      }
    }
    await this.browser?.close();
    this.browser = null;
    this.setPhase('stopped');
    this.clearTimers();
  }

  async pause(): Promise<void> {
    this.paused = true;
    this.setPhase('paused');
    for (const u of this.users.values()) {
      await u.stop();
    }
    this.users.clear();
    contextsActive.set(0);
  }

  async resume(): Promise<void> {
    if (this.rampInProgress) {
      return;
    }

    applyResolvedTarget(this.config);
    this.config.run.paused = false;

    await this.ensureBrowser();

    const url = this.config.target.frontend_base_url;
    if (!(await probeFrontend(url))) {
      this.paused = true;
      this.setPhase('paused');
      const msg = this.clusterHint(`Cannot resume: ${url} is not reachable`);
      this.statusMessage = msg;
      throw new Error(msg);
    }

    this.paused = false;
    this.degraded = false;
    this.frontendReachable = true;
    frontendProbe.set(1);
    this.setPhase('ramping_up');
    this.statusMessage = `Ramping to ${this.targetCount} users at ${url}…`;

    this.rampInProgress = true;
    void this.completeResumeRamp(url);
  }

  private async completeResumeRamp(url: string): Promise<void> {
    try {
      await this.rampTo(this.targetCount);
    } catch (err) {
      console.error('Resume ramp failed:', err);
      this.paused = true;
      this.setPhase('paused');
      this.statusMessage =
        err instanceof Error ? err.message : 'Resume ramp failed — check logs';
      return;
    } finally {
      this.rampInProgress = false;
    }

    if (this.paused) {
      return;
    }

    if (this.targetCount > 0 && this.users.size === 0) {
      this.paused = true;
      this.setPhase('paused');
      this.statusMessage = this.clusterHint(
        `No virtual users started at ${url} — verify target and Playwright`
      );
      return;
    }

    this.setPhase('running');
    this.statusMessage = `Running ${this.users.size}/${this.targetCount} users at ${url}`;
  }

  private async ensureBrowser(): Promise<void> {
    if (this.browser?.isConnected()) {
      return;
    }

    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }

    this.browser = await chromium.launch({
      headless: this.config.browser.headless,
      slowMo: this.config.browser.slow_mo_ms
    });
  }

  async applyScenario(name: string): Promise<void> {
    applyScenarioSafe(this.config, name);
    this.userShardPlan = this.applyShardPlan();
    if (!this.paused) await this.rampTo(this.targetCount);
  }

  applyRumScenario(scenarioId: string, options: ApplyRumScenarioOptions = {}): void {
    this.config.rum_batch = buildRumBatchForScenario(scenarioId, options);
    this.config.run.scenario = `rum:${scenarioId}`;
    this.restartVirtualUsersForRum();
  }

  applyRumBatchPreset(presetId: string): void {
    const preset = RUM_DEMO_BATCH_PRESETS.find(p => p.id === presetId);
    if (preset && this.config.users.count < preset.suggestedUsers) {
      this.config.users.count = preset.suggestedUsers;
      this.config.users.max_contexts_per_pod = Math.max(
        this.config.users.max_contexts_per_pod,
        preset.suggestedUsers
      );
      this.userShardPlan = this.applyShardPlan();
    }
    this.config.rum_batch = buildRumBatchForPreset(presetId);
    this.config.run.scenario = `rum_batch:${presetId}`;
    this.restartVirtualUsersForRum();
  }

  disableRumDemo(): void {
    this.config.rum_batch = buildDisabledRumBatch();
    this.restartVirtualUsersForRum();
  }

  /** When running, restarts users in the background so control API returns immediately. */
  private restartVirtualUsersForRum(): void {
    if (this.paused) {
      for (const u of this.users.values()) {
        u.updateConfig(this.config);
      }
      return;
    }

    if (this.rampInProgress) {
      throw new Error('Ramp in progress — wait for the current ramp to finish, then apply RUM again');
    }

    const target = this.targetCount;
    this.rampInProgress = true;
    this.setPhase('ramping_up');
    this.statusMessage = 'Applying RUM configuration (restarting virtual users)…';
    void this.completeRumRestartRamp(target);
  }

  private async completeRumRestartRamp(target: number): Promise<void> {
    try {
      await this.rampTo(0);
      if (!this.paused && target > 0) {
        await this.rampTo(target);
      }
      if (!this.paused && target > 0) {
        this.statusMessage = `RUM active — ${this.users.size}/${target} users on this pod`;
      }
    } catch (err) {
      console.error('RUM restart ramp failed:', err);
      this.paused = true;
      this.setPhase('paused');
      this.statusMessage =
        err instanceof Error ? err.message : 'RUM restart failed — check logs';
    } finally {
      this.rampInProgress = false;
    }
  }

  mergeConfig(partial: Partial<LoadConfig>): void {
    const prevTarget = this.config.target.frontend_base_url;
    const merged = JSON.parse(JSON.stringify(this.config)) as LoadConfig;
    if (partial.users) {
      const { session_pacing: sessionPacingPartial, ...restUsers } = partial.users;
      Object.assign(merged.users, restUsers);
      if (sessionPacingPartial) {
        merged.users.session_pacing = {
          ...merged.users.session_pacing,
          ...sessionPacingPartial
        };
      }
      normalizeUsers(merged.users);
    }
    if (partial.shard) {
      Object.assign(merged.shard, partial.shard);
    }
    if (partial.profiles?.mix) Object.assign(merged.profiles.mix, partial.profiles.mix);
    if (partial.chaos) Object.assign(merged.chaos, partial.chaos);
    if (partial.run) Object.assign(merged.run, partial.run);
    if (partial.target?.frontend_base_url) {
      merged.target.frontend_base_url = coerceTargetUrl(partial.target.frontend_base_url);
    }
    if (partial.rum_batch) {
      merged.rum_batch = {
        ...merged.rum_batch,
        ...partial.rum_batch,
        matrix: partial.rum_batch.matrix ?? merged.rum_batch?.matrix ?? []
      };
    }
    this.config = merged;
    applyResolvedTarget(this.config);
    this.boardResolver.updateConfig(this.config);

    if (
      partial.target?.frontend_base_url &&
      this.config.target.frontend_base_url !== prevTarget
    ) {
      void this.reconfigureTarget(this.config.target.frontend_base_url);
      return;
    }

    for (const u of this.users.values()) u.updateConfig(this.config);
    if (
      partial.users?.count !== undefined ||
      partial.users?.max_contexts_per_pod !== undefined ||
      partial.shard?.count !== undefined
    ) {
      this.userShardPlan = this.applyShardPlan();
      if (!this.paused) void this.rampTo(this.targetCount);
    }
  }

  getStateSnapshot(): Record<string, unknown> {
    const agg = GlobalMetricsCollector.getInstance().aggregate();
    const metrics = GlobalMetricsCollector.getInstance();
    return {
      runId: this.config.run.run_id,
      phase: this.phase,
      paused: this.paused,
      degraded: this.degraded,
      activeContexts: this.users.size,
      targetContexts: this.targetCount,
      totalTargetUsers: this.userShardPlan.totalUsers,
      shard: {
        index: this.userShardPlan.shardIndex,
        count: this.userShardPlan.shardCount,
        globalIndexOffset: this.userShardPlan.globalIndexOffset
      },
      isControlPlane: this.isControlPlane(),
      frontendReachable: this.frontendReachable,
      cmsReachable: this.cmsReachable,
      inCluster: isInClusterFlag(),
      effectiveTargetUrl: this.config.target.frontend_base_url,
      errorRate: agg.errorRate,
      warmupComplete: this.warmupComplete,
      counters: {
        actionsTotal: agg.actionsTotal,
        actionsFailed: agg.actionsFailed,
        pageErrors: metrics.pageErrors,
        chaosActions: metrics.chaosActions
      },
      latencyMs: agg.latencyMs,
      recentErrors: agg.recentErrors,
      startedAt: this.startedAt,
      scenario: this.config.run.scenario,
      rumBatch: this.config.rum_batch ?? { enabled: false },
      statusMessage: this.statusMessage,
      targetUrl: this.config.target.frontend_base_url
    };
  }

  private setPhase(phase: EnginePhase): void {
    this.phase = phase;
    setEnginePhaseMetric(phase);
  }

  private async rampTo(target: number): Promise<void> {
    if (this.paused) {
      return;
    }

    if (!this.browser?.isConnected()) {
      await this.ensureBrowser();
    }

    if (!this.browser) {
      this.statusMessage = 'Playwright browser is not available';
      this.paused = true;
      this.setPhase('paused');
      return;
    }

    if (target > 0) {
      const reachable = await probeFrontend(this.config.target.frontend_base_url);
      this.frontendReachable = reachable;
      frontendProbe.set(reachable ? 1 : 0);
      if (!reachable) {
        this.statusMessage = this.clusterHint(
          `Target down; not spawning users (${this.config.target.frontend_base_url})`
        );
        if (this.users.size === 0) {
          this.paused = true;
          this.setPhase('paused');
        }
        return;
      }
    }

    const current = this.users.size;
    if (target > current) {
      this.setPhase('ramping_up');
      const delta = target - current;
      const rampMs = parseDurationMs(this.config.run.ramp_up) ?? 30000;
      const interval = Math.max(100, Math.floor(rampMs / Math.max(1, delta)));

      for (let i = current; i < target; i++) {
        if (this.paused) break;
        await this.spawnUser(i);
        contextsActive.set(this.users.size);
        if (i < target - 1) await new Promise(r => setTimeout(r, interval));
      }
      this.setPhase('running');
    } else if (target < current) {
      this.setPhase('ramping_down');
      const indices = [...this.users.keys()].slice(0, current - target);
      const rampMs = parseDurationMs(this.config.run.ramp_down) ?? 10000;
      const interval = Math.max(50, Math.floor(rampMs / Math.max(1, indices.length)));

      for (const idx of indices) {
        const u = this.users.get(idx);
        if (u) {
          await u.stop();
          this.users.delete(idx);
        }
        contextsActive.set(this.users.size);
        await new Promise(r => setTimeout(r, interval));
      }
      if (this.users.size === 0) this.setPhase('idle');
      else this.setPhase('running');
    } else {
      this.setPhase(target === 0 ? 'idle' : 'running');
    }
  }

  private async spawnUser(localIndex: number): Promise<void> {
    if (!this.browser) return;
    const globalIndex = this.userShardPlan.globalIndexOffset + localIndex;
    const user = new VirtualBrowserUser(
      this.browser,
      this.config,
      this.boardResolver,
      globalIndex
    );
    this.users.set(localIndex, user);
    await user.start();
  }

  private async runProbeOnce(): Promise<void> {
    const wasUp = this.frontendReachable;
    const target = this.config.target.frontend_base_url;
    this.frontendReachable = await probeFrontend(target);
    frontendProbe.set(this.frontendReachable ? 1 : 0);
    this.cmsReachable = await probeCms(this.config);
    cmsProbe.set(this.cmsReachable ? 1 : 0);

    if (!this.frontendReachable && this.users.size > 0 && !this.paused) {
      console.warn('Frontend unreachable — pausing virtual users');
      this.statusMessage = this.clusterHint(
        `Paused: ${this.config.target.frontend_base_url} unreachable`
      );
      await this.pause();
    } else if (this.frontendReachable && !wasUp && this.paused && !this.degraded) {
      this.statusMessage = `Target back online at ${this.config.target.frontend_base_url}. Click Resume.`;
    }
  }

  private startProbeLoop(): void {
    this.probeTimer = setInterval(() => void this.runProbeOnce(), 5000);
  }

  private startAbortMonitor(): void {
    this.abortMonitor = setInterval(() => {
      const agg = GlobalMetricsCollector.getInstance().aggregate();
      const { decision, statusMessage } = evaluateAbortCondition({
        warmupComplete: this.warmupComplete,
        errorRate: agg.errorRate,
        errorRateThreshold: this.config.abort.error_rate_threshold,
        onAbort: this.config.abort.on_abort
      });

      if (decision === 'none') return;

      if (statusMessage) {
        this.statusMessage = statusMessage;
        console.error(statusMessage);
      }

      if (decision === 'continue') {
        return;
      }
      if (decision === 'exit') {
        void this.stop().then(() => process.exit(2));
      } else if (decision === 'pause') {
        void this.pause();
      } else if (decision === 'degrade') {
        this.degraded = true;
        this.setPhase('degraded');
        if (!this.paused) void this.rampTo(this.targetCount);
      }
    }, 5000);
  }

  private startReportLoop(): void {
    this.reportTimer = setInterval(() => {
      const agg = GlobalMetricsCollector.getInstance().aggregate();
      const report = {
        runId: this.config.run.run_id,
        scenario: this.config.run.scenario,
        windowEnd: new Date().toISOString(),
        activeContexts: this.users.size,
        errorRate: agg.errorRate,
        actionsPerSecond: 0,
        latencyMs: agg.latencyMs
      };
      try {
        const dir = path.dirname(this.config.report.path);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.config.report.path, JSON.stringify(report, null, 2));
      } catch {
        /* reports dir may not exist locally */
      }
    }, this.config.report.rolling_interval_s * 1000);
  }

  private clearTimers(): void {
    if (this.durationTimer) clearTimeout(this.durationTimer);
    if (this.reportTimer) clearInterval(this.reportTimer);
    if (this.probeTimer) clearInterval(this.probeTimer);
    if (this.abortMonitor) clearInterval(this.abortMonitor);
  }
}
