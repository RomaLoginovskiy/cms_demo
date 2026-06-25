// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

jest.mock('@coralogix/browser', () => ({
  CoralogixRum: {
    addTiming: jest.fn(),
    endTimeMeasure: jest.fn(),
    init: jest.fn(),
    log: jest.fn(),
    sendCustomMeasurement: jest.fn(),
    startTimeMeasure: jest.fn(),
    startSessionRecording: jest.fn(),
    stopSessionRecording: jest.fn(),
    screenshot: jest.fn(() => 'ss-mock-id')
  },
  CoralogixLogSeverity: {
    Debug: 'debug',
    Info: 'info',
    Warn: 'warn',
    Error: 'error',
    Critical: 'critical'
  }
}));

Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001')
  },
  configurable: true
});

class MockPath2D {
  moveTo = jest.fn();
  lineTo = jest.fn();
}

Object.defineProperty(globalThis, 'Path2D', {
  value: MockPath2D,
  configurable: true
});

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: jest.fn(() => ({
    clearRect: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    scale: jest.fn(),
    translate: jest.fn(),
    beginPath: jest.fn(),
    rect: jest.fn(),
    ellipse: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    setLineDash: jest.fn(),
    fillText: jest.fn(),
    drawImage: jest.fn(),
    measureText: jest.fn(() => ({ width: 48 }))
  }))
});
