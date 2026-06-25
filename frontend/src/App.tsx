import React, { useState } from 'react';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import './App.css';
import Hero from './components/Hero';
import MediaGallery from './components/MediaGallery';
import MediaModal from './components/MediaModal';
import MediaStats from './components/MediaStats';
import MediaUpload from './components/MediaUpload';
import Navigation from './components/Navigation';
import { MediaProvider } from './contexts/MediaContext';
import { Media } from './types';

function CmsRoutes(): JSX.Element {
  const navigate = useNavigate();
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);

  function handleMediaSelect(media: Media): void {
    if (!media.id) {
      navigate('/upload');
      return;
    }

    setSelectedMedia(media);
  }

  return (
    <>
      <Navigation onNavigate={navigate} />
      <Routes>
        <Route path="/upload" element={<MediaUpload />} />
        <Route path="/stats" element={<MediaStats />} />
        <Route path="/about" element={<AboutPage />} />
        <Route
          path="*"
          element={(
            <>
              <Hero title="Demo CMS" subtitle="Media gallery and upload demo" />
              <MediaGallery onMediaSelect={handleMediaSelect} />
              <MediaModal media={selectedMedia} isOpen={selectedMedia !== null} onClose={() => setSelectedMedia(null)} />
            </>
          )}
        />
      </Routes>
    </>
  );
}

function AboutPage(): JSX.Element {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-display mb-4 text-gray-900">About Demo CMS</h1>
      <p className="text-gray-600">
        Demo CMS stores media metadata and image files for the gallery and for external consumers such as the canvas app.
      </p>
    </main>
  );
}

export default function App(): JSX.Element {
  const basePath = process.env.REACT_APP_BASE_PATH ?? '';

  return (
    <MediaProvider>
      <BrowserRouter basename={basePath}>
        <CmsRoutes />
      </BrowserRouter>
    </MediaProvider>
  );
}
