import React from 'react';
import { useLocation } from 'react-router-dom';
import { measurementService } from '../services/measurements';

interface NavigationProps {
  onNavigate: (page: string) => void;
}

export default function Navigation({ onNavigate }: NavigationProps) {
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { label: 'Gallery', path: '/' },
    { label: 'Upload', path: '/upload' },
    { label: 'Stats', path: '/stats' },
    { label: 'About', path: '/about' },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-center py-4">
          <div className="flex space-x-8">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  // Track navigation events
                  measurementService.sendCustomMeasurement('navigation_clicks', 1, {
                    from_page: currentPath,
                    to_page: item.path,
                    nav_label: item.label
                  });
                  
                  // Start timing for page transition
                  measurementService.startTimeMeasurement(`page_transition_${item.path.replace('/', '_')}`, {
                    from: currentPath,
                    to: item.path
                  });
                  
                  onNavigate(item.path);
                }}
                className={`nav-link ${
                  currentPath === item.path ? 'nav-link-active' : ''
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
} 