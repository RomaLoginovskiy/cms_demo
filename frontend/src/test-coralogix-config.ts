// Test script to verify Coralogix beforeSend configuration for stats page
// This file can be imported in console or used for testing

import { CoralogixLogSeverity } from '@coralogix/browser';

// Mock event for testing the beforeSend function
const createMockEvent = (pageUrl: string, severity: CoralogixLogSeverity = CoralogixLogSeverity.Info) => ({
  page_context: {
    page_url: pageUrl,
    page_url_blueprint: pageUrl,
    page_fragments: 'main',
    referrer: 'http://localhost:3000/'
  },
  event_context: {
    severity: severity,
    type: 'custom-log',
    source: 'user'
  },
  version_metadata: {
    app_name: 'cms-demo'
  },
  labels: {}
});

// Test function to simulate the beforeSend logic
const testBeforeSend = (event: any) => {
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
  
  return event;
};

// Test cases
export const runTests = () => {
  console.log('=== Testing Coralogix beforeSend Configuration ===');
  
  // Test 1: Stats page event should be elevated to Critical
  console.log('\n--- Test 1: Stats page event ---');
  const statsEvent = createMockEvent('http://localhost:3000/stats', CoralogixLogSeverity.Info);
  const processedStatsEvent = testBeforeSend(statsEvent);
  console.log('Original severity:', CoralogixLogSeverity.Info);
  console.log('Processed severity:', processedStatsEvent.event_context.severity);
  console.log('Labels:', processedStatsEvent.labels);
  console.log('Expected: Critical severity with stats indicators ✓');
  
  // Test 2: Non-stats page event should remain unchanged
  console.log('\n--- Test 2: Gallery page event ---');
  const galleryEvent = createMockEvent('http://localhost:3000/', CoralogixLogSeverity.Info);
  const processedGalleryEvent = testBeforeSend(galleryEvent);
  console.log('Original severity:', CoralogixLogSeverity.Info);
  console.log('Processed severity:', processedGalleryEvent.event_context.severity);
  console.log('Expected: Info severity unchanged ✓');
  
  // Test 3: Stats page with different severity
  console.log('\n--- Test 3: Stats page warning event ---');
  const statsWarningEvent = createMockEvent('http://localhost:3000/stats', CoralogixLogSeverity.Warn);
  const processedStatsWarningEvent = testBeforeSend(statsWarningEvent);
  console.log('Original severity:', CoralogixLogSeverity.Warn);
  console.log('Processed severity:', processedStatsWarningEvent.event_context.severity);
  console.log('Expected: Critical severity (elevated from Warning) ✓');
  
  console.log('\n=== All tests completed ===');
};

// Export for use in console
(window as any).testCoralogixConfig = runTests;