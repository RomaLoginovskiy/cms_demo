import { BACKGROUND_NOISE_ERROR, CRITICAL_BOARD_ERROR, RumScenarioDefinition } from '../types';
import { emitStableError, startBackgroundNoise, startErrorBurst } from '../helpers';

export const s01CriticalErrorSpike: RumScenarioDefinition = {
  id: 's01',
  title: 'Critical-flow error spike',
  useCase: 'UC1',
  description: 'Stable fingerprint on board critical path across many sessions',
  activate(ctx) {
    const burstCount = 3;
    return startErrorBurst(ctx, CRITICAL_BOARD_ERROR, 'critical', burstCount, 500);
  },
  runOnce(ctx) {
    emitStableError(CRITICAL_BOARD_ERROR, 'critical', { feature_area: 'board' });
    startErrorBurst(ctx, CRITICAL_BOARD_ERROR, 'critical', 5, 100);
  }
};

export const s04FreePlanNoise: RumScenarioDefinition = {
  id: 's04',
  title: 'High-volume background noise',
  useCase: 'UC2',
  description: 'High-count low-impact errors tagged plan=free, path_class=background',
  activate(ctx) {
    return startBackgroundNoise(ctx, 150);
  },
  runOnce() {
    for (let i = 0; i < 20; i += 1) {
      emitStableError(BACKGROUND_NOISE_ERROR, 'background', { plan: 'free' });
    }
  }
};
