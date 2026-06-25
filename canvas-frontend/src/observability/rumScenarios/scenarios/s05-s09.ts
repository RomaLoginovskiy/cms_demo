import { CRITICAL_BOARD_ERROR, ENTERPRISE_CRITICAL_ERROR, RumScenarioDefinition, VERSION_NEW_ERROR } from '../types';
import { emitStableError } from '../helpers';
import { maybeBlockMainThread } from '../../canvasLagSim';
import { setPathClass } from '../../rumLabelContext';

export const s05EnterpriseHighImpact: RumScenarioDefinition = {
  id: 's05',
  title: 'Low-volume high-impact error',
  useCase: 'UC2',
  description: 'Rare critical errors on enterprise board path',
  activate(ctx) {
    const timerId = ctx.schedule(() => {
      setPathClass('critical');
      emitStableError(ENTERPRISE_CRITICAL_ERROR, 'critical', { plan: 'enterprise' });
      maybeBlockMainThread(120);
    }, 2000);
    return () => ctx.clearSchedule(timerId);
  },
  runOnce() {
    setPathClass('critical');
    emitStableError(ENTERPRISE_CRITICAL_ERROR, 'critical', { plan: 'enterprise' });
    maybeBlockMainThread(150);
  }
};

const VERSION_ERROR_MAP: Record<string, { message: string; count: number }> = {
  '1.92903': { message: CRITICAL_BOARD_ERROR, count: 1 },
  '1.95821': { message: VERSION_NEW_ERROR, count: 4 }
};

export const s09VersionErrorDelta: RumScenarioDefinition = {
  id: 's09',
  title: 'Version-tagged error delta',
  useCase: 'UC4',
  description: 'Elevated error rate and new fingerprint on v1.95821 vs v1.92903',
  activate(ctx) {
    const version = ctx.config.version;
    const spec = VERSION_ERROR_MAP[version] ?? VERSION_ERROR_MAP['1.95821']!;
    let fired = 0;
    const timerId = ctx.schedule(function tick() {
      emitStableError(spec.message, 'critical', { app_version: version });
      fired += 1;
      if (fired < spec.count) {
        ctx.schedule(tick, 800);
      }
    }, 1000);
    return () => ctx.clearSchedule(timerId);
  },
  runOnce(ctx) {
    const version = ctx.config.version;
    const spec = VERSION_ERROR_MAP[version] ?? VERSION_ERROR_MAP['1.95821']!;
    for (let i = 0; i < spec.count; i += 1) {
      emitStableError(spec.message, 'critical', { app_version: version });
    }
  }
};
