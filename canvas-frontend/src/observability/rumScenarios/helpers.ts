import { rumCaptureError, rumInfoLog } from '../coralogixRum';
import { incrementErrorsEmitted, setPathClass } from '../rumLabelContext';
import { RumScenarioContext } from './types';

export function emitStableError(message: string, pathClass: string, extra?: Record<string, unknown>): void {
  setPathClass(pathClass);
  const error = new Error(message);
  rumCaptureError(error, { path_class: pathClass, ...extra }, { path_class: pathClass });
  incrementErrorsEmitted();
}

export function startErrorBurst(
  ctx: RumScenarioContext,
  message: string,
  pathClass: string,
  count: number,
  intervalMs: number
): () => void {
  let fired = 0;
  const timerId = ctx.schedule(() => {
    emitStableError(message, pathClass);
    fired += 1;
    if (fired < count) {
      startErrorBurst(ctx, message, pathClass, count - fired, intervalMs);
    }
  }, intervalMs);
  return () => ctx.clearSchedule(timerId);
}

export function startBackgroundNoise(ctx: RumScenarioContext, intervalMs = 200): () => void {
  let tick = 0;
  const run = (): void => {
    tick += 1;
    rumInfoLog('ApiClient: SyntaxError: Unexpected token in JSON at position 0', {
      tick,
      path_class: 'background'
    }, { path_class: 'background', plan: 'free' });
  };
  run();
  const timerId = window.setInterval(run, intervalMs);
  return () => window.clearInterval(timerId);
}
