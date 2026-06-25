import { refreshMemoryUsageMb, refreshNetworkEffectiveType } from './rumLabelContext';

const MEMORY_SAMPLE_INTERVAL_MS = 5000;
const NETWORK_SAMPLE_INTERVAL_MS = 30000;

let stopSampling: (() => void) | null = null;

export function startRumRuntimeMetricsSampling(): () => void {
  stopRumRuntimeMetricsSampling();

  refreshNetworkEffectiveType();
  refreshMemoryUsageMb();

  const memoryTimerId = window.setInterval(refreshMemoryUsageMb, MEMORY_SAMPLE_INTERVAL_MS);
  const networkTimerId = window.setInterval(refreshNetworkEffectiveType, NETWORK_SAMPLE_INTERVAL_MS);

  stopSampling = (): void => {
    window.clearInterval(memoryTimerId);
    window.clearInterval(networkTimerId);
    stopSampling = null;
  };

  return stopSampling;
}

export function stopRumRuntimeMetricsSampling(): void {
  stopSampling?.();
}

export function resetRumRuntimeMetricsForTests(): void {
  stopRumRuntimeMetricsSampling();
}
