import client from 'prom-client';
import { ActionRecord } from '../engine/ActionRecorder';
import { EnginePhase } from '../config/types';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const contextsActive = new client.Gauge({
  name: 'canvas_load_browser_contexts_active',
  help: 'Active browser contexts',
  registers: [register]
});

export const enginePhase = new client.Gauge({
  name: 'canvas_load_engine_phase',
  help: 'Engine phase enum',
  labelNames: ['phase'],
  registers: [register]
});

export const actionsTotal = new client.Counter({
  name: 'canvas_load_actions_total',
  help: 'Total profile actions',
  labelNames: ['profile', 'action', 'ok'],
  registers: [register]
});

export const actionDuration = new client.Histogram({
  name: 'canvas_load_action_duration_seconds',
  help: 'Action duration',
  labelNames: ['profile', 'action'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const pageErrors = new client.Counter({
  name: 'canvas_load_page_errors_total',
  help: 'Uncaught page errors',
  registers: [register]
});

export const chaosActions = new client.Counter({
  name: 'canvas_load_chaos_actions_total',
  help: 'Chaos actions',
  labelNames: ['action'],
  registers: [register]
});

export const frontendProbe = new client.Gauge({
  name: 'canvas_load_frontend_probe_success',
  help: 'Frontend probe',
  registers: [register]
});

export const cmsProbe = new client.Gauge({
  name: 'canvas_load_cms_probe_success',
  help: 'CMS probe',
  registers: [register]
});

export const rumSessionsTotal = new client.Counter({
  name: 'canvas_load_rum_sessions_total',
  help: 'RUM demo sessions started with scenario/plan/version labels',
  labelNames: ['scenario', 'plan', 'version'],
  registers: [register]
});

export const runInfo = new client.Gauge({
  name: 'canvas_load_run_info',
  help: 'Run metadata',
  labelNames: ['run_id', 'scenario'],
  registers: [register]
});

const phaseMap: Record<EnginePhase, number> = {
  idle: 0,
  ramping_up: 1,
  running: 2,
  degraded: 3,
  paused: 4,
  ramping_down: 5,
  stopped: 6
};

export function setEnginePhaseMetric(phase: EnginePhase): void {
  for (const p of Object.keys(phaseMap) as EnginePhase[]) {
    enginePhase.set({ phase: p }, p === phase ? 1 : 0);
  }
}

export function recordActionMetrics(record: ActionRecord): void {
  actionsTotal.inc({
    profile: record.profile,
    action: record.action,
    ok: String(record.ok)
  });
  actionDuration.observe(
    { profile: record.profile, action: record.action },
    record.durationMs / 1000
  );
  if (!record.ok && record.profile === 'chaos') {
    chaosActions.inc({ action: record.action });
  }
}

export function getMetricsRegistry(): client.Registry {
  return register;
}

export async function getMetricsText(): Promise<string> {
  return register.metrics();
}
