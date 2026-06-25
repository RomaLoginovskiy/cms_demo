import React, { useState, useEffect, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useMedia } from '../contexts/MediaContext';
import { Media } from '../types';
import { measurementService } from '../services/measurements';
import { rumDebugLog, rumInfoLog, rumWarnLog } from '../observability/coralogixRum';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface StatsData {
  totalFiles: number;
  averageFileSize: number;
  totalSize: number;
  fileSizeGrowth: { date: string; totalSize: number }[];
  fileCountGrowth: { date: string; count: number }[];
}

export default function MediaStats() {
  const { state } = useMedia();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Track page view for stats page - this will be elevated to Critical
    measurementService.sendCustomMeasurement('page_views', 1, {
      page: '/stats',
      page_title: 'Media Statistics'
    });

    // Log stats page access with critical severity
    rumInfoLog(
      'User accessed Media Statistics page',
      { 
        action: 'page_access',
        page: 'stats',
        media_count: state.media.length 
      },
      { 
        page_category: 'stats',
        user_action: 'navigation' 
      }
    );

    // Start timing for stats calculation
    measurementService.startTimeMeasurement('stats_calculation', {
      total_media_items: state.media.length.toString()
    });

    // Simulate loading time for stats calculation
    const timer = setTimeout(() => {
      setLoading(false);
      measurementService.endTimeMeasurement('stats_calculation');
      
      // Log stats calculation completion
      rumInfoLog(
        'Stats calculation completed',
        { 
          calculation_time: '500ms',
          media_items_processed: state.media.length 
        },
        { 
          page_category: 'stats',
          operation: 'calculation' 
        }
      );
    }, 500);

    return () => clearTimeout(timer);
  }, [state.media.length]);

  const statsData: StatsData = useMemo(() => {
    if (state.media.length === 0) {
      // Log when no data is available for stats
      rumWarnLog(
        'No media data available for statistics',
        { media_count: 0 },
        { page_category: 'stats', data_availability: 'empty' }
      );
      
      return {
        totalFiles: 0,
        averageFileSize: 0,
        totalSize: 0,
        fileSizeGrowth: [],
        fileCountGrowth: []
      };
    }

    // Calculate basic stats
    const totalFiles = state.media.length;
    const totalSize = state.media.reduce((sum, media) => sum + media.size, 0);
    const averageFileSize = totalSize / totalFiles;

    // Log key statistics calculations
    rumInfoLog(
      'Stats data calculated successfully',
      { 
        total_files: totalFiles,
        total_size_bytes: totalSize,
        average_file_size_bytes: averageFileSize
      },
      { 
        page_category: 'stats', 
        operation: 'data_calculation' 
      }
    );

    // Sort media by upload date
    const sortedMedia = [...state.media].sort(
      (a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
    );

    // Calculate growth data
    const fileSizeGrowth: { date: string; totalSize: number }[] = [];
    const fileCountGrowth: { date: string; count: number }[] = [];
    
    let cumulativeSize = 0;
    let cumulativeCount = 0;
    
    // Group by date and calculate cumulative values
    const dateGroups = new Map<string, Media[]>();
    
    sortedMedia.forEach(media => {
      const date = new Date(media.uploadedAt).toISOString().split('T')[0] ?? 'unknown';
      if (!dateGroups.has(date)) {
        dateGroups.set(date, []);
      }
      dateGroups.get(date)!.push(media);
    });

    // Convert to growth arrays
    const sortedDates = Array.from(dateGroups.keys()).sort();
    
    sortedDates.forEach(date => {
      const mediaOnDate = dateGroups.get(date)!;
      cumulativeCount += mediaOnDate.length;
      cumulativeSize += mediaOnDate.reduce((sum, media) => sum + media.size, 0);
      
      fileSizeGrowth.push({
        date,
        totalSize: cumulativeSize
      });
      
      fileCountGrowth.push({
        date,
        count: cumulativeCount
      });
    });

    // Log growth data points
    rumInfoLog(
      'Growth charts data prepared',
      { 
        data_points: sortedDates.length,
        date_range_start: sortedDates[0] ?? 'none',
        date_range_end: sortedDates[sortedDates.length - 1] ?? 'none'
      },
      { 
        page_category: 'stats', 
        operation: 'chart_data_preparation' 
      }
    );

    return {
      totalFiles,
      averageFileSize,
      totalSize,
      fileSizeGrowth,
      fileCountGrowth
    };
  }, [state.media]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  // Chart options with interaction tracking
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        onClick: (e: any, legendItem: any) => {
          // Log chart legend interactions
          rumInfoLog(
            'Chart legend clicked',
            { 
              legend_text: legendItem.text,
              chart_type: 'line_chart' 
            },
            { 
              page_category: 'stats', 
              user_interaction: 'chart_legend_click' 
            }
          );
        },
      },
      tooltip: {
        callbacks: {
          beforeTitle: (context: any) => {
            // Log chart tooltip interactions
            rumDebugLog(
              'Chart tooltip displayed',
              { 
                data_point_index: context[0]?.dataIndex,
                chart_dataset: context[0]?.dataset?.label 
              },
              { 
                page_category: 'stats', 
                user_interaction: 'chart_tooltip' 
              }
            );
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
      x: {
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
    },
    onClick: (event: any, elements: any) => {
      if (elements.length > 0) {
        const element = elements[0];
        rumInfoLog(
          'Chart data point clicked',
          { 
            dataset_index: element.datasetIndex,
            data_index: element.index,
            chart_type: 'line_chart'
          },
          { 
            page_category: 'stats', 
            user_interaction: 'chart_click' 
          }
        );
      }
    }
  };

  // File size growth chart data
  const fileSizeChartData = {
    labels: statsData.fileSizeGrowth.map(item => formatDate(item.date)),
    datasets: [
      {
        label: 'Total File Size',
        data: statsData.fileSizeGrowth.map(item => item.totalSize),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.1,
      },
    ],
  };

  // File count growth chart data
  const fileCountChartData = {
    labels: statsData.fileCountGrowth.map(item => formatDate(item.date)),
    datasets: [
      {
        label: 'Total File Count',
        data: statsData.fileCountGrowth.map(item => item.count),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.1,
      },
    ],
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-200 h-32 rounded-lg"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-gray-200 h-64 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h2 className="text-3xl font-display mb-8 text-gray-900">Media Statistics</h2>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-100 mr-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Total Files</p>
              <p className="text-2xl font-bold text-gray-900">{statsData.totalFiles.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-green-100 mr-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Average File Size</p>
              <p className="text-2xl font-bold text-gray-900">{formatFileSize(statsData.averageFileSize)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-purple-100 mr-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Total Storage</p>
              <p className="text-2xl font-bold text-gray-900">{formatFileSize(statsData.totalSize)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      {statsData.fileSizeGrowth.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Total File Size Growth Chart */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Total Storage Growth</h3>
            <div style={{ height: '300px' }}>
              <Line
                data={{
                  ...fileSizeChartData,
                  datasets: fileSizeChartData.datasets.map(dataset => ({
                    ...dataset,
                    data: dataset.data.map(value => value / (1024 * 1024)) // Convert to MB for display
                  }))
                }}
                options={{
                  ...chartOptions,
                  scales: {
                    ...chartOptions.scales,
                    y: {
                      ...chartOptions.scales.y,
                      ticks: {
                        callback: function(value) {
                          return value + ' MB';
                        }
                      }
                    }
                  },
                  plugins: {
                    ...chartOptions.plugins,
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          return `${context.dataset.label}: ${formatFileSize((context.parsed.y ?? 0) * 1024 * 1024)}`;
                        }
                      }
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* File Count Growth Chart */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">File Count Growth</h3>
            <div style={{ height: '300px' }}>
              <Line data={fileCountChartData} options={chartOptions} />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No data available</h3>
          <p className="mt-2 text-gray-500">Upload some media files to see statistics and growth charts.</p>
        </div>
      )}
    </div>
  );
}