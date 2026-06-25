import {
  applyLagDelay,
  isLagSimActive,
  readCanvasLagSimConfig,
  resetCanvasLagSimForTests,
  shouldApplyLargeBoardRenderCost,
  shouldDelayHubOutbound,
  usesNoOptimisticUi
} from './canvasLagSim';
import { resetCoralogixRumForTests } from './coralogixRum';

describe('canvasLagSim', () => {
  beforeEach(() => {
    resetCanvasLagSimForTests();
    resetCoralogixRumForTests();
    delete window.__APP_CONFIG__;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses lag simulation config from runtime env', () => {
    window.__APP_CONFIG__ = {
      CANVAS_LAG_SIM_ENABLED: 'true',
      CANVAS_LAG_SIM_MODE: 'no_optimistic',
      CANVAS_LAG_SIM_DELAY_MS: '6000',
      CANVAS_LAG_SIM_JITTER_MS: '100',
      CANVAS_LAG_SIM_RENDER_COST_US: '25',
      CANVAS_LAG_SIM_LARGE_BOARD_THRESHOLD: '1200',
      CORALOGIX_ENVIRONMENT: 'local'
    };

    const config = readCanvasLagSimConfig();
    expect(config.enabled).toBe(true);
    expect(config.mode).toBe('no_optimistic');
    expect(config.delayMs).toBe(6000);
    expect(config.jitterMs).toBe(100);
    expect(config.renderCostUs).toBe(25);
    expect(config.largeBoardThreshold).toBe(1200);
  });

  it('blocks lag simulation in production without allow flag', () => {
    const config = readCanvasLagSimConfig({
      CANVAS_LAG_SIM_ENABLED: 'true',
      CANVAS_LAG_SIM_MODE: 'no_optimistic',
      CORALOGIX_ENVIRONMENT: 'production'
    });

    expect(isLagSimActive(config, 'production')).toBe(false);
    expect(usesNoOptimisticUi(null)).toBe(false);
  });

  it('allows lag simulation in production when explicitly allowed', () => {
    const config = readCanvasLagSimConfig({
      CANVAS_LAG_SIM_ENABLED: 'true',
      CANVAS_LAG_SIM_MODE: 'no_optimistic',
      CANVAS_LAG_SIM_ALLOW_PROD: 'true',
      CORALOGIX_ENVIRONMENT: 'production'
    });

    expect(isLagSimActive(config, 'production')).toBe(true);
    expect(usesNoOptimisticUi(config)).toBe(true);
    expect(shouldDelayHubOutbound(config)).toBe(true);
  });

  it('applies hub delay for hub_outbound and no_optimistic modes', () => {
    const hubOutbound = readCanvasLagSimConfig({
      CANVAS_LAG_SIM_ENABLED: 'true',
      CANVAS_LAG_SIM_MODE: 'hub_outbound',
      CORALOGIX_ENVIRONMENT: 'local'
    });
    const noOptimistic = readCanvasLagSimConfig({
      CANVAS_LAG_SIM_ENABLED: 'true',
      CANVAS_LAG_SIM_MODE: 'no_optimistic',
      CORALOGIX_ENVIRONMENT: 'local'
    });
    const renderOnly = readCanvasLagSimConfig({
      CANVAS_LAG_SIM_ENABLED: 'true',
      CANVAS_LAG_SIM_MODE: 'large_board_render',
      CORALOGIX_ENVIRONMENT: 'local'
    });

    expect(shouldDelayHubOutbound(hubOutbound)).toBe(true);
    expect(shouldDelayHubOutbound(noOptimistic)).toBe(true);
    expect(shouldDelayHubOutbound(renderOnly)).toBe(false);
  });

  it('enables large-board render cost only above threshold', () => {
    const config = readCanvasLagSimConfig({
      CANVAS_LAG_SIM_ENABLED: 'true',
      CANVAS_LAG_SIM_MODE: 'large_board_render',
      CANVAS_LAG_SIM_RENDER_COST_US: '10',
      CANVAS_LAG_SIM_LARGE_BOARD_THRESHOLD: '1000',
      CORALOGIX_ENVIRONMENT: 'local'
    });

    expect(shouldApplyLargeBoardRenderCost(999, config)).toBe(false);
    expect(shouldApplyLargeBoardRenderCost(1000, config)).toBe(true);
  });

  it('waits for configured lag delay', async () => {
    jest.useFakeTimers();
    const promise = applyLagDelay(500, 0);
    jest.advanceTimersByTime(499);
    await Promise.resolve();
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    jest.advanceTimersByTime(1);
    await promise;
    expect(settled).toBe(true);
    jest.useRealTimers();
  });
});
