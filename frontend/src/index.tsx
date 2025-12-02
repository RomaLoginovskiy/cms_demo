import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { CoralogixRum, CoralogixLogSeverity } from '@coralogix/browser';
import { measurementService } from './services/measurements';




CoralogixRum.init({
  stringifyCustomLogData: true,
  public_key: 'cxth_tiCsD3nWNpGSucynGBcjYScotHFAEw',
  application: 'cms-demo',
  version: '1.0',
  coralogixDomain: 'EU1',
  instrumentations: {
    xhr: true,
    fetch: true,
    web_vitals: true,
    interactions: true,
    custom: true,
    errors: true,
    long_tasks: true,
    resources: true,
  },

  sessionConfig: {

    keepSessionAfterReload: true // ← This is where it belongs!
  },

  sessionRecordingConfig: {
    
    
    enable: true, // Must declare.
    /**
     * If autoStartSessionRecording is false, you can manually start & stop your session recording.
     * Refer to Recording Manually Section.
     **/
    autoStartSessionRecording: true, // Automatically records your session when SDK is up.
    recordConsoleEvents: true, // Will record all console events from dev tools. Levels: log, debug, warn, error, info, table etc..
    sessionRecordingSampleRate: 100, // Percentage of overall sessions recording being tracked, defaults to 100% and applied after the overall sessionSampleRate.
  },
  traceParentInHeader: {
    
    enabled: true,
    options: {
      propagateTraceHeaderCorsUrls: [new RegExp('.*')],
    },
  },
  beforeSend: (event) => {
    const page_context = event.page_context || {};
    const event_context = event.event_context || {};
    const version_metadata = event.version_metadata || {};
    
    const { page_url, page_url_blueprint, page_fragments, referrer } = page_context;
    const { severity, type } = event_context;
    const { app_name } = version_metadata;
    
    console.log(`Processing ${type} event from ${page_url} with severity ${severity}`);
    
    // Set all events from stats page to critical level
    const isStatsPage = page_url && page_url.includes('/stats');
    
    if (isStatsPage) {
      // Elevate all events from stats page to critical
      event.event_context = event.event_context || {};
      event.event_context.severity = CoralogixLogSeverity.Critical;
      
      // Add stats page indicator
      event.labels = {
        ...event.labels,
        critical_page: 'true',
        page_category: 'stats',
        stats_event: 'true'
      };
      
      console.log(`Stats page event elevated to Critical severity: ${type}`);
    }
    
    // Add page-based context for all pages
    if (page_url) {
      event.labels = {
        ...event.labels,
        page_section: page_fragments || 'unknown',
        url_blueprint: page_url_blueprint || 'unknown'
      };
    }
    
    // Track user journey with referrer information
    if (referrer && referrer !== page_url) {
      event.labels = {
        ...event.labels,
        has_referrer: 'true',
        referrer_domain: (() => {
          try {
            return new URL(referrer).hostname;
          } catch {
            return 'unknown';
          }
        })()
      };
    }
    
    // Environment-specific handling
    if (page_url) {
      if (page_url.includes('localhost') || page_url.includes('dev.')) {
        event.version_metadata = event.version_metadata || {};
        event.version_metadata.app_name = `${app_name || 'cms-demo'}-dev`;
      } else if (page_url.includes('staging.')) {
        event.version_metadata = event.version_metadata || {};
        event.version_metadata.app_name = `${app_name || 'cms-demo'}-staging`;
      }
    }
    
    // Enhanced context for custom measurements from stats page
    if (event.event_context.type === 'custom-measurement') {
      return {
        ...event,
        labels: {
          ...event.labels,
          environment: process.env.NODE_ENV,
          region: 'us-east'
        }
      };
    }
    
    return event;
  }
});

CoralogixRum.setLabels({
  ...CoralogixRum.getLabels(),
  spanType: 'frontend'
});

// Initialize measurement service and start global tracking
document.addEventListener('DOMContentLoaded', () => {
  // Track page load performance
  measurementService.addTiming('dom_content_loaded');
  
  // Initialize global tracking
  measurementService.trackInteractionMetrics();
  measurementService.trackResourceMetrics();
  
  // Initial DOM and memory measurements
  setTimeout(() => {
    measurementService.measureDOMMetrics();
    measurementService.measureMemoryUsage();
  }, 1000);
  
  // Periodic memory measurements
  setInterval(() => {
    measurementService.measureMemoryUsage();
  }, 30000); // Every 30 seconds
});

// Track application start time
measurementService.startTimeMeasurement('app_initialization', {
  environment: process.env.NODE_ENV || 'development'
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// End app initialization measurement after render
setTimeout(() => {
  measurementService.endTimeMeasurement('app_initialization');
}, 100);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
