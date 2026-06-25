import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import {
  getActiveLagSimConfig,
  isLagSimActive,
  logLagSimBoot,
  readCanvasLagSimConfig
} from './observability/canvasLagSim';
import { initializeCoralogixRum } from './observability/coralogixRum';
import { activateScenario } from './observability/rumScenarios/activate';
import { parseRumSessionConfig } from './observability/rumSessionConfig';
import { measurementService } from './services/measurements';

const rumSessionConfig = parseRumSessionConfig();
initializeCoralogixRum(window.__APP_CONFIG__ ?? {}, rumSessionConfig);
activateScenario(rumSessionConfig);

const lagConfig = readCanvasLagSimConfig();
if (isLagSimActive(lagConfig)) {
  logLagSimBoot(lagConfig);
  measurementService.sendCustomMeasurement('canvas_lag_sim_active', 1, {
    mode: lagConfig.mode,
    delay_ms: String(lagConfig.delayMs)
  });
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
