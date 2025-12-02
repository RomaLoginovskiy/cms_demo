# Coralogix Custom Measurements Documentation

This document describes all the custom measurements and time tracking implemented in the CMS Demo frontend application using the Coralogix Browser SDK.

## Overview

The application implements comprehensive observability using:
- **Custom Time Measurements**: Track duration of operations using `startTimeMeasure()` and `endTimeMeasure()`
- **Custom Numeric Measurements**: Send numeric data points using `sendCustomMeasurement()`
- **Performance Timings**: Track page load and resource metrics using `addTiming()`
- **Component Lifecycle**: Monitor React component behavior
- **User Interactions**: Measure user engagement and behavior
- **API Performance**: Monitor network requests and responses

## Custom Time Measurements

### Application Lifecycle
- `app_initialization`: Time from app start to render completion
- `gallery_load_time`: Complete MediaGallery component loading time
- `media_fetch_time`: Time to fetch media items from API
- `media_gallery_load`: Combined measurement for the entire gallery loading process

### API Operations
- `api_call_[endpoint]`: Individual API call durations (e.g., `api_call_api_media`)
- `upload_[fileId]`: Individual file upload durations
- `batch_upload_time`: Time for batch upload operations

### Component Measurements
- `[ComponentName]_mount_time`: Time for component to mount and initialize
- `page_transition_[page]`: Time for navigation between pages

### User Interface
- `thumbnail_load_time`: Time for media thumbnails to load

## Custom Numeric Measurements

### User Interaction Metrics
- `navigation_clicks`: Number of navigation button clicks
- `media_tile_clicks`: Number of media item clicks
- `upload_button_clicks`: Number of upload button clicks
- `user_clicks_total`: Global click counter
- `user_scrolls_total`: Global scroll event counter
- `user_keyboard_events_total`: Global keyboard event counter
- `drag_drop_events`: Number of drag-and-drop interactions
- `file_browser_events`: Number of file browser usage events

### File Upload Metrics
- `files_selected_count`: Number of files selected for upload
- `files_accepted_count`: Number of files that passed validation
- `files_rejected_count`: Number of files rejected during validation
- `files_total_size_bytes`: Total size of selected files
- `upload_file_count`: Number of files in upload operation
- `upload_total_size_bytes`: Total size of files being uploaded
- `successful_uploads`: Count of successful file uploads
- `failed_uploads`: Count of failed file uploads
- `batch_upload_initiated`: Number of batch upload operations started
- `batch_upload_file_count`: Number of files in batch uploads
- `batch_upload_completed`: Number of completed batch uploads

### Upload Performance
- `file_upload_time_ms`: Individual file upload duration
- `file_upload_size_bytes`: Individual file upload size
- `file_upload_throughput_mbps`: Upload throughput in Mbps

### API Performance
- `api_response_time_ms`: API response time with endpoint and method labels
- `api_response_size_bytes`: API response payload size
- `media_items_count`: Number of media items returned from API

### Gallery Metrics
- `gallery_items_loaded`: Number of media items loaded in gallery
- `gallery_load_errors`: Count of gallery loading errors
- `gallery_retry_attempts`: Number of retry attempts after errors

### Image Loading
- `thumbnail_loads_successful`: Successful thumbnail loads
- `thumbnail_loads_failed`: Failed thumbnail loads
- `image_load_time_ms`: Image loading duration
- `image_width_pixels`: Image width in pixels
- `image_height_pixels`: Image height in pixels
- `image_total_pixels`: Total pixels (width × height)

### DOM and Performance
- `dom_content_loaded_time`: DOM content loaded event duration
- `dom_interactive_time`: DOM interactive timing
- `dom_element_count`: Number of DOM elements on page
- `viewport_width`: Browser viewport width
- `viewport_height`: Browser viewport height

### Memory Usage
- `memory_used_js_heap_bytes`: Used JavaScript heap size
- `memory_total_js_heap_bytes`: Total JavaScript heap size
- `memory_js_heap_limit_bytes`: JavaScript heap size limit

### Resource Loading
- `resource_load_time`: Resource loading duration with resource type labels
- `resource_transfer_size_bytes`: Resource transfer size

### Component Lifecycle
- `component_mounts`: Component mount events
- `component_unmounts`: Component unmount events
- `component_renders`: Component render events
- `component_lifespan_ms`: Component lifespan duration
- `component_interactions`: User interactions within components

### Upload Success Rates
- `upload_success_rate`: Upload success rate percentage (0-100)

### Async Operations
- `async_operations_successful`: Successful async operations
- `async_operations_failed`: Failed async operations

### User Interactions (Detailed)
- `user_interactions_click`: Click interactions by element type
- `user_interactions_focus`: Focus interactions by element type
- `user_interactions_input`: Input interactions with length tracking
- `user_input_length_chars`: Character count in input fields

## Labels and Context

Most measurements include contextual labels for better analysis:

### Common Labels
- `component_name`: Name of the React component
- `environment`: Current environment (development/production)
- `region`: Application region
- `spanType`: Always set to "frontend"

### API-specific Labels
- `endpoint`: API endpoint path
- `method`: HTTP method (GET, POST, etc.)
- `status_code`: HTTP response status code

### File-specific Labels
- `file_name`: Name of uploaded file
- `file_type`: MIME type of file
- `file_size`: File size category (large/small)
- `upload_success`: Upload success status

### Navigation Labels
- `from_page`: Source page path
- `to_page`: Destination page path
- `nav_label`: Navigation button label

### Error Labels
- `error_type`: Type of error encountered
- `upload_success`: Success/failure status

## Usage Examples

### Starting a Time Measurement
```typescript
import { measurementService } from '../services/measurements';

// Start measuring an operation
measurementService.startTimeMeasurement('my_operation', {
  operation_type: 'data_load',
  user_id: 'user123'
});

// End the measurement
measurementService.endTimeMeasurement('my_operation');
```

### Sending Custom Measurements
```typescript
// Send a numeric measurement
measurementService.sendCustomMeasurement('items_processed', 42, {
  process_type: 'batch_operation',
  success: 'true'
});
```

### Using Component Hooks
```typescript
import { useComponentMeasurement } from '../hooks/useMeasurement';

function MyComponent() {
  const { measureInteraction, startTimer, endTimer } = useComponentMeasurement('MyComponent', {
    variant: 'modal'
  });

  const handleClick = () => {
    measureInteraction('button_click', { button_type: 'submit' });
  };

  return <button onClick={handleClick}>Submit</button>;
}
```

### Measuring Async Operations
```typescript
import { useAsyncMeasurement } from '../hooks/useMeasurement';

function DataLoader() {
  const { measureAsync } = useAsyncMeasurement();

  const loadData = async () => {
    const result = await measureAsync('data_load_operation', async () => {
      return await api.getData();
    }, {
      data_type: 'user_media'
    });
    
    return result;
  };
}
```

## Integration with Coralogix

All measurements are automatically sent to Coralogix with:
- Session context and user information
- Trace correlation for distributed tracing
- Automatic error capture and context
- Custom labels for filtering and analysis

The measurements can be viewed in:
- Coralogix RUM dashboards
- Custom dashboards using the measurements as metrics
- Alerting based on thresholds
- Correlation with logs and traces

## Performance Considerations

- Measurements are lightweight and non-blocking
- Timers are automatically cleaned up
- Memory usage is tracked to prevent leaks
- Background measurements run at appropriate intervals
- Failed operations are tracked without affecting user experience

## Troubleshooting

### Common Issues
1. **Missing measurements**: Check browser console for SDK initialization errors
2. **Incorrect timings**: Ensure `endTimeMeasurement()` is called for every `startTimeMeasurement()`
3. **Performance impact**: Monitor measurement frequency to avoid overhead

### Debugging
Enable debug logging in the Coralogix SDK configuration to see measurement events in the browser console.