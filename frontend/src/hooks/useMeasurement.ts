import { useEffect, useRef } from 'react';
import { measurementService } from '../services/measurements';

/**
 * Custom hook for measuring component lifecycle and performance
 */
export function useComponentMeasurement(componentName: string, labels?: Record<string, string>) {
  const renderCountRef = useRef(0);
  const mountTimeRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Track component mount
    mountTimeRef.current = performance.now();
    renderCountRef.current++;
    
    measurementService.sendCustomMeasurement(`component_mounts`, 1, {
      component_name: componentName,
      ...labels
    });
    
    measurementService.startTimeMeasurement(`${componentName}_mount_time`, {
      component_name: componentName,
      ...labels
    });

    return () => {
      // Track component unmount
      measurementService.endTimeMeasurement(`${componentName}_mount_time`);
      
      if (mountTimeRef.current) {
        const lifespan = performance.now() - mountTimeRef.current;
        measurementService.sendCustomMeasurement(`component_lifespan_ms`, lifespan, {
          component_name: componentName,
          ...labels
        });
      }
      
      measurementService.sendCustomMeasurement(`component_unmounts`, 1, {
        component_name: componentName,
        ...labels
      });
    };
  }, [componentName, labels]);

  // Track renders
  useEffect(() => {
    renderCountRef.current++;
    measurementService.sendCustomMeasurement(`component_renders`, 1, {
      component_name: componentName,
      ...labels
    });
  });

  return {
    renderCount: renderCountRef.current,
    measureInteraction: (actionName: string, actionLabels?: Record<string, string>) => {
      measurementService.sendCustomMeasurement(`component_interactions`, 1, {
        component_name: componentName,
        action_name: actionName,
        ...labels,
        ...actionLabels
      });
    },
    startTimer: (timerName: string, timerLabels?: Record<string, string>) => {
      measurementService.startTimeMeasurement(`${componentName}_${timerName}`, {
        component_name: componentName,
        ...labels,
        ...timerLabels
      });
    },
    endTimer: (timerName: string) => {
      measurementService.endTimeMeasurement(`${componentName}_${timerName}`);
    }
  };
}

/**
 * Custom hook for measuring async operations
 */
export function useAsyncMeasurement() {
  return {
    measureAsync: async <T>(
      operationName: string, 
      operation: () => Promise<T>, 
      labels?: Record<string, string>
    ): Promise<T> => {
      measurementService.startTimeMeasurement(operationName, labels);
      
      try {
        const result = await operation();
        measurementService.endTimeMeasurement(operationName);
        
        measurementService.sendCustomMeasurement(`async_operations_successful`, 1, {
          operation_name: operationName,
          ...labels
        });
        
        return result;
      } catch (error) {
        measurementService.endTimeMeasurement(operationName);
        
        measurementService.sendCustomMeasurement(`async_operations_failed`, 1, {
          operation_name: operationName,
          error_type: error instanceof Error ? error.name : 'unknown',
          ...labels
        });
        
        throw error;
      }
    }
  };
}

/**
 * Custom hook for measuring user interactions
 */
export function useInteractionMeasurement(elementType: string) {
  return {
    trackClick: (elementId?: string, elementLabels?: Record<string, string>) => {
      measurementService.sendCustomMeasurement(`user_interactions_click`, 1, {
        element_type: elementType,
        element_id: elementId || 'unknown',
        ...elementLabels
      });
    },
    trackFocus: (elementId?: string, elementLabels?: Record<string, string>) => {
      measurementService.sendCustomMeasurement(`user_interactions_focus`, 1, {
        element_type: elementType,
        element_id: elementId || 'unknown',
        ...elementLabels
      });
    },
    trackInput: (inputLength: number, elementId?: string, elementLabels?: Record<string, string>) => {
      measurementService.sendCustomMeasurement(`user_interactions_input`, 1, {
        element_type: elementType,
        element_id: elementId || 'unknown',
        input_length: inputLength.toString(),
        ...elementLabels
      });
      
      measurementService.sendCustomMeasurement(`user_input_length_chars`, inputLength, {
        element_type: elementType,
        element_id: elementId || 'unknown',
        ...elementLabels
      });
    }
  };
}