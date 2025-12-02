import { CoralogixRum, CoralogixLogSeverity } from '@coralogix/browser';

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
    this.timers.set(name, {
      startTime: performance.now(),
      labels
    });
    
    // Use the official Coralogix SDK method
    CoralogixRum.startTimeMeasure(name, labels);
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
      
      // Use the official Coralogix SDK method
      CoralogixRum.endTimeMeasure(name);
      
      // Also send as custom measurement for numeric tracking
      this.sendCustomMeasurement(`${name}_duration_ms`, duration, timer.labels);
    }
  }

  /**
   * Send a custom numeric measurement
   * @param name - Name of the measurement
   * @param value - Numeric value
   * @param labels - Optional labels for context
   */
  sendCustomMeasurement(name: string, value: number, labels?: Record<string, string>): void {
    CoralogixRum.sendCustomMeasurement(name, value);
    
    // Add labels if provided by sending a custom log with measurement context
    if (labels) {
      CoralogixRum.log(
        CoralogixLogSeverity.Info, 
        `Custom measurement: ${name} = ${value}`,
        { measurement_value: value, measurement_name: name },
        labels
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
      CoralogixRum.addTiming(name, customTime);
    } else {
      CoralogixRum.addTiming(name);
    }
  }

  /**
   * Measure and track DOM-related metrics
   */
  measureDOMMetrics(): void {
    const domContentLoaded = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
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
              resource_name: resourceEntry.name,
              resource_type: resourceEntry.initiatorType
            }
          );

          // Track resource size if available
          if (resourceEntry.transferSize > 0) {
            this.sendCustomMeasurement(
              'resource_transfer_size_bytes',
              resourceEntry.transferSize,
              {
                resource_name: resourceEntry.name,
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
        api_endpoint: url,
        http_method: method,
        status_code: statusCode?.toString() || 'unknown'
      }
    );

    if (responseSize) {
      this.sendCustomMeasurement(
        'api_response_size_bytes',
        responseSize,
        {
          api_endpoint: url,
          http_method: method
        }
      );
    }
  }

  /**
   * Track image loading metrics
   */
  trackImageMetrics(imageUrl: string, loadTime: number, naturalWidth: number, naturalHeight: number): void {
    this.sendCustomMeasurement('image_load_time_ms', loadTime, { image_url: imageUrl });
    this.sendCustomMeasurement('image_width_pixels', naturalWidth, { image_url: imageUrl });
    this.sendCustomMeasurement('image_height_pixels', naturalHeight, { image_url: imageUrl });
    this.sendCustomMeasurement('image_total_pixels', naturalWidth * naturalHeight, { image_url: imageUrl });
  }

  /**
   * Track upload metrics
   */
  trackUploadMetrics(fileName: string, fileSize: number, uploadTime: number, success: boolean): void {
    this.sendCustomMeasurement(
      'file_upload_time_ms',
      uploadTime,
      {
        file_name: fileName,
        upload_success: success.toString()
      }
    );

    this.sendCustomMeasurement(
      'file_upload_size_bytes',
      fileSize,
      {
        file_name: fileName,
        upload_success: success.toString()
      }
    );

    if (fileSize > 0 && uploadTime > 0) {
      const throughputMbps = (fileSize / (1024 * 1024)) / (uploadTime / 1000);
      this.sendCustomMeasurement(
        'file_upload_throughput_mbps',
        throughputMbps,
        {
          file_name: fileName
        }
      );
    }
  }
}

// Export singleton instance
export const measurementService = new MeasurementService();