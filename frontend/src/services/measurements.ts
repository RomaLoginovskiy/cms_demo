import {
  rumAddTiming,
  rumEndTimeMeasure,
  rumInfoLog,
  rumSendCustomMeasurement,
  rumStartTimeMeasure
} from '../observability/coralogixRum';

/**
 * Service for managing custom measurements and time tracking using Coralogix SDK
 */
class MeasurementService {
  private timers: Map<string, { startTime: number; labels?: Record<string, string> }> = new Map();

  /**
   * Start a custom time measurement
   * @param name - Unique name for the measurement
   * @param labels - Optional labels to add context
   */
  startTimeMeasurement(name: string, labels?: Record<string, string>): void {
    this.timers.set(name, labels
      ? { startTime: performance.now(), labels }
      : { startTime: performance.now() });
    
    rumStartTimeMeasure(sanitizeMeasurementName(name), sanitizeLabels(labels));
  }

  /**
   * End a custom time measurement
   * @param name - Name of the measurement to end
   */
  endTimeMeasurement(name: string): void {
    const timer = this.timers.get(name);
    if (timer) {
      const duration = performance.now() - timer.startTime;
      this.timers.delete(name);
      
      const safeName = sanitizeMeasurementName(name);
      rumEndTimeMeasure(safeName);
      
      // Also send as custom measurement for numeric tracking
      this.sendCustomMeasurement(`${safeName}_duration_ms`, duration, timer.labels);
    }
  }

  /**
   * Send a custom numeric measurement
   * @param name - Name of the measurement
   * @param value - Numeric value
   * @param labels - Optional labels for context
   */
  sendCustomMeasurement(name: string, value: number, labels?: Record<string, string>): void {
    const safeName = sanitizeMeasurementName(name);
    rumSendCustomMeasurement(safeName, value);
    
    // Add labels if provided by sending a custom log with measurement context
    const safeLabels = sanitizeLabels(labels);
    if (safeLabels) {
      rumInfoLog(
        `Custom measurement: ${safeName} = ${value}`,
        { measurement_value: value, measurement_name: safeName },
        safeLabels
      );
    }
  }

  /**
   * Add a timing measurement relative to page load
   * @param name - Name of the timing
   * @param customTime - Optional custom time, otherwise uses current time
   */
  addTiming(name: string, customTime?: number): void {
    if (customTime !== undefined) {
      rumAddTiming(name, customTime);
    } else {
      rumAddTiming(name);
    }
  }

  /**
   * Measure and track DOM-related metrics
   */
  measureDOMMetrics(): void {
    const domContentLoaded = typeof performance.getEntriesByType === 'function'
      ? performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      : undefined;
    if (domContentLoaded) {
      this.sendCustomMeasurement('dom_content_loaded_time', domContentLoaded.domContentLoadedEventEnd - domContentLoaded.domContentLoadedEventStart);
      this.sendCustomMeasurement('dom_interactive_time', domContentLoaded.domInteractive - domContentLoaded.fetchStart);
    }

    // Count DOM elements
    const elementCount = document.querySelectorAll('*').length;
    this.sendCustomMeasurement('dom_element_count', elementCount);

    // Measure viewport size
    this.sendCustomMeasurement('viewport_width', window.innerWidth);
    this.sendCustomMeasurement('viewport_height', window.innerHeight);
  }

  /**
   * Track user interaction metrics
   */
  trackInteractionMetrics(): void {
    let clickCount = 0;
    let scrollCount = 0;
    let keyboardCount = 0;

    // Track clicks
    document.addEventListener('click', () => {
      clickCount++;
      this.sendCustomMeasurement('user_clicks_total', clickCount);
    });

    // Track scroll events (throttled)
    let scrollTimeout: NodeJS.Timeout;
    document.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        scrollCount++;
        this.sendCustomMeasurement('user_scrolls_total', scrollCount);
      }, 100);
    });

    // Track keyboard events
    document.addEventListener('keydown', () => {
      keyboardCount++;
      this.sendCustomMeasurement('user_keyboard_events_total', keyboardCount);
    });
  }

  /**
   * Measure memory usage if available
   */
  measureMemoryUsage(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.sendCustomMeasurement('memory_used_js_heap_bytes', memory.usedJSHeapSize);
      this.sendCustomMeasurement('memory_total_js_heap_bytes', memory.totalJSHeapSize);
      this.sendCustomMeasurement('memory_js_heap_limit_bytes', memory.jsHeapSizeLimit);
    }
  }

  /**
   * Track resource loading metrics
   */
  trackResourceMetrics(): void {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'resource') {
          const resourceEntry = entry as PerformanceResourceTiming;
          
          // Track resource loading time
          this.sendCustomMeasurement(
            'resource_load_time', 
            resourceEntry.responseEnd - resourceEntry.startTime,
            {
              resource_type: resourceEntry.initiatorType
            }
          );

          // Track resource size if available
          if (resourceEntry.transferSize > 0) {
            this.sendCustomMeasurement(
              'resource_transfer_size_bytes',
              resourceEntry.transferSize,
              {
                resource_type: resourceEntry.initiatorType
              }
            );
          }
        }
      }
    });

    observer.observe({ entryTypes: ['resource'] });
  }

  /**
   * Track API response times and sizes
   */
  trackAPIMetrics(url: string, method: string, startTime: number, endTime: number, responseSize?: number, statusCode?: number): void {
    const duration = endTime - startTime;
    
    this.sendCustomMeasurement(
      'api_response_time_ms',
      duration,
      {
        api_endpoint: sanitizeEndpoint(url),
        http_method: method.toUpperCase(),
        status_code: statusCode?.toString() || 'unknown'
      }
    );

    if (responseSize) {
      this.sendCustomMeasurement(
        'api_response_size_bytes',
        responseSize,
        {
          api_endpoint: sanitizeEndpoint(url),
          http_method: method.toUpperCase()
        }
      );
    }
  }

  /**
   * Track image loading metrics
   */
  trackImageMetrics(imageUrl: string, loadTime: number, naturalWidth: number, naturalHeight: number): void {
    const labels = { image_source: imageUrl ? 'cms' : 'unknown' };
    this.sendCustomMeasurement('image_load_time_ms', loadTime, labels);
    this.sendCustomMeasurement('image_width_pixels', naturalWidth, labels);
    this.sendCustomMeasurement('image_height_pixels', naturalHeight, labels);
    this.sendCustomMeasurement('image_total_pixels', naturalWidth * naturalHeight, labels);
  }

  /**
   * Track upload metrics
   */
  trackUploadMetrics(fileName: string, fileSize: number, uploadTime: number, success: boolean): void {
    this.sendCustomMeasurement(
      'file_upload_time_ms',
      uploadTime,
      {
        file_extension: fileExtension(fileName),
        upload_success: success.toString()
      }
    );

    this.sendCustomMeasurement(
      'file_upload_size_bytes',
      fileSize,
      {
        file_extension: fileExtension(fileName),
        upload_success: success.toString()
      }
    );

    if (fileSize > 0 && uploadTime > 0) {
      const throughputMbps = (fileSize / (1024 * 1024)) / (uploadTime / 1000);
      this.sendCustomMeasurement(
        'file_upload_throughput_mbps',
        throughputMbps,
        {
          file_extension: fileExtension(fileName)
        }
      );
    }
  }
}

// Export singleton instance
export const measurementService = new MeasurementService();

function sanitizeLabels(labels?: Record<string, string>): Record<string, string> | undefined {
  if (!labels) {
    return undefined;
  }

  const safeLabels = Object.entries(labels).reduce<Record<string, string>>((acc, [key, value]) => {
    if (isSensitiveLabelKey(key)) {
      return acc;
    }

    acc[key] = isEndpointLabelKey(key) ? sanitizeEndpoint(value) : value;
    return acc;
  }, {});

  return Object.keys(safeLabels).length > 0 ? safeLabels : undefined;
}

function isSensitiveLabelKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.includes('url')
    || normalized === 'file_name'
    || normalized === 'tag'
    || normalized === 'resource_name'
    || normalized === 'tags'
    || normalized === 'id'
    || normalized.endsWith('_id');
}

function isEndpointLabelKey(key: string): boolean {
  return key.toLowerCase().includes('endpoint');
}

function sanitizeMeasurementName(name: string): string {
  const [baseName] = name.split(/[?#]/);
  return (baseName ?? name)
    .replace(/(upload_)[a-z0-9]{8,}/gi, '$1id')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, 'id')
    .replace(/\b[0-9a-f]{8,}\b/gi, 'id')
    .replace(/\b\d+\b/g, 'id');
}

function sanitizeEndpoint(url: string): string {
  const pathname = extractPathname(url);
  return pathname
    .split('/')
    .map(segment => isIdentifierSegment(segment) ? ':id' : segment)
    .join('/');
}

function extractPathname(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url.split('?')[0] || '/';
  }
}

function isIdentifierSegment(segment: string): boolean {
  return /^\d+$/.test(segment)
    || /^[0-9a-f]{8,}$/i.test(segment)
    || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment);
}

function fileExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension && /^[a-z0-9]{1,10}$/.test(extension) ? extension : 'unknown';
}