import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initializeCoralogixRum } from './observability/coralogixRum';
import { initializeOpenTelemetry } from './observability/openTelemetry';

// Order matters: RUM registers the global OTel context manager and propagator that the OTel SDK then reuses.
initializeCoralogixRum();
initializeOpenTelemetry();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
