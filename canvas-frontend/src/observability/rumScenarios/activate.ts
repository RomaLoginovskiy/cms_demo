import { rumWarnLog } from '../coralogixRum';
import { setScenarioBeforeSendHook } from '../rumBeforeSend';
import { isRumDemoInjectorsAllowed, RumSessionConfig } from '../rumSessionConfig';
import { resolveScenario } from './registry';
import { RumScenarioContext } from './types';

let activeTeardown: (() => void) | null = null;
let activeScenarioId: string | null = null;

export function activateScenario(config: RumSessionConfig): void {
  deactivateScenario();

  if (!config.scenarioId) {
    return;
  }

  if (!isRumDemoInjectorsAllowed(config)) {
    rumWarnLog('RUM demo scenario blocked by safety gate', { scenario: config.scenarioId });
    return;
  }

  const definition = resolveScenario(config.scenarioId);
  if (!definition) {
    rumWarnLog('Unknown RUM demo scenario', { scenario: config.scenarioId });
    return;
  }

  const ctx = createScenarioContext(config);
  const teardown = definition.activate(ctx);
  if (typeof teardown === 'function') {
    activeTeardown = teardown;
  }
  if (definition.beforeSend) {
    setScenarioBeforeSendHook(definition.beforeSend);
  }
  activeScenarioId = definition.id;
}

export function runScenarioOnce(config: RumSessionConfig): void {
  if (!config.scenarioId || !isRumDemoInjectorsAllowed(config)) {
    return;
  }
  const definition = resolveScenario(config.scenarioId);
  if (!definition?.runOnce) {
    return;
  }
  definition.runOnce(createScenarioContext(config));
}

export function deactivateScenario(): void {
  activeTeardown?.();
  activeTeardown = null;
  activeScenarioId = null;
  setScenarioBeforeSendHook(null);
}

export function getActiveScenarioId(): string | null {
  return activeScenarioId;
}

export function resetScenarioActivationForTests(): void {
  deactivateScenario();
}

function createScenarioContext(config: RumSessionConfig): RumScenarioContext {
  return {
    config,
    schedule: (fn, ms) => window.setTimeout(fn, ms),
    clearSchedule: (id) => window.clearTimeout(id)
  };
}
