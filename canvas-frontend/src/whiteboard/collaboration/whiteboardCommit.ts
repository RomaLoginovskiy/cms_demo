import { measurementService } from '../../services/measurements';
import { getActiveLagSimConfig, usesNoOptimisticUi } from '../../observability/canvasLagSim';
import { useWhiteboardStore } from '../store/whiteboardStore';

export async function commitShapeCreate(
  hubFn: () => Promise<void>,
  onLocalApply: () => void,
  onRevert: () => void,
  labels: Record<string, string>
): Promise<void> {
  await runInteractionCommit(hubFn, onLocalApply, onRevert, labels);
}

export async function commitShapeUpdate(
  hubFn: () => Promise<void>,
  onLocalApply: () => void,
  onRevert: () => void,
  labels: Record<string, string>
): Promise<void> {
  await runInteractionCommit(hubFn, onLocalApply, onRevert, labels);
}

export async function commitShapeDelete(
  hubFn: () => Promise<void>,
  onLocalApply: () => void,
  onRevert: () => void,
  labels: Record<string, string>
): Promise<void> {
  await runInteractionCommit(hubFn, onLocalApply, onRevert, labels);
}

async function runInteractionCommit(
  hubFn: () => Promise<void>,
  onLocalApply: () => void,
  onRevert: () => void,
  labels: Record<string, string>
): Promise<void> {
  const lagConfig = getActiveLagSimConfig();
  const lagMode = lagConfig?.mode ?? 'off';
  const measurementLabels = { ...labels, lag_sim_mode: lagMode };

  measurementService.startTimeMeasurement('whiteboard_interaction_commit', measurementLabels);

  if (usesNoOptimisticUi(lagConfig)) {
    try {
      await hubFn();
      onLocalApply();
    } catch {
      useWhiteboardStore.getState().setConnectionStatus('error');
      onRevert();
    } finally {
      measurementService.endTimeMeasurement('whiteboard_interaction_commit');
    }
    return;
  }

  onLocalApply();
  try {
    await hubFn();
  } catch {
    useWhiteboardStore.getState().setConnectionStatus('error');
    onRevert();
  } finally {
    measurementService.endTimeMeasurement('whiteboard_interaction_commit');
  }
}
