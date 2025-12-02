import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { MediaProvider } from './contexts/MediaContext';
import Hero from './components/Hero';
import Navigation from './components/Navigation';
import MediaGallery from './components/MediaGallery';
import MediaModal from './components/MediaModal';
import MediaUpload from './components/MediaUpload';
import MediaStats from './components/MediaStats';
import { Media } from './types/index';
import './App.css';






function AppContent() {
  const navigate = useNavigate();
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const handleMediaSelect = (media: Media) => {
    setSelectedMedia(media);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedMedia(null);
  };

  return (
    <div className="min-h-screen bg-white">
      <Hero 
        title="Scout Finch" 
        subtitle="Photographer" 
      />
      
      <Navigation onNavigate={handleNavigate} />
      
      <main>
        <Routes>
          <Route 
            path="/" 
            element={<MediaGallery onMediaSelect={handleMediaSelect} />} 
          />
          <Route 
            path="/upload" 
            element={<MediaUpload />} 
          />
          <Route 
            path="/stats" 
            element={<MediaStats />} 
          />
          <Route 
            path="/about" 
            element={
              <div className="max-w-2xl mx-auto px-4 py-8">
                <h2 className="text-2xl font-display mb-4">About</h2>
                <p className="text-gray-600">This is a demo CMS application showcasing modern web development with React, .NET Core, and OpenTelemetry observability.</p>
              </div>
            } 
          />
        </Routes>
      </main>

      <MediaModal
        media={selectedMedia}
        isOpen={isModalOpen}
        onClose={closeModal}
      />
    </div>
  );
}

function App() {
  return (
    <MediaProvider>
      <Router>
        <AppContent />
      </Router>
    </MediaProvider>
  );
}

export default App;
