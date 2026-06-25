import { resetCanvasLagSimForTests } from '../../observability/canvasLagSim';
import { measurementService } from '../../services/measurements';
import { useWhiteboardStore } from '../store/whiteboardStore';
import { commitShapeCreate } from './whiteboardCommit';

jest.mock('../../observability/coralogixRum', () => ({
  rumStartTimeMeasure: jest.fn(),
  rumEndTimeMeasure: jest.fn(),
  rumSendCustomMeasurement: jest.fn(),
  rumInfoLog: jest.fn(),
  rumWarnLog: jest.fn(),
  resetCoralogixRumForTests: jest.fn()
}));

describe('whiteboardCommit', () => {
  beforeEach(() => {
    resetCanvasLagSimForTests();
    delete window.__APP_CONFIG__;
    useWhiteboardStore.getState().resetBoard();
    jest.clearAllMocks();
  });

  it('applies local state only after hub when no_optimistic is enabled', async () => {
    window.__APP_CONFIG__ = {
      CANVAS_LAG_SIM_ENABLED: 'true',
      CANVAS_LAG_SIM_MODE: 'no_optimistic',
      CANVAS_LAG_SIM_DELAY_MS: '1',
      CORALOGIX_ENVIRONMENT: 'local'
    };

    const order: string[] = [];
    const endSpy = jest.spyOn(measurementService, 'endTimeMeasurement');

    await commitShapeCreate(
      async () => {
        order.push('hub');
      },
      () => {
        order.push('local');
      },
      () => {
        order.push('revert');
      },
      { operation: 'test' }
    );

    expect(order).toEqual(['hub', 'local']);
    expect(endSpy).toHaveBeenCalledWith('whiteboard_interaction_commit');
  });

  it('applies local state before hub in optimistic mode', async () => {
    const order: string[] = [];

    await commitShapeCreate(
      async () => {
        order.push('hub');
      },
      () => {
        order.push('local');
      },
      () => {
        order.push('revert');
      },
      { operation: 'test' }
    );

    expect(order).toEqual(['local', 'hub']);
  });

  it('marks connection error when hub commit fails in optimistic mode', async () => {
    await commitShapeCreate(
      async () => {
        throw new Error('hub down');
      },
      () => undefined,
      () => undefined,
      { operation: 'test' }
    );

    expect(useWhiteboardStore.getState().connectionStatus).toBe('error');
  });
});
