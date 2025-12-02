import React from 'react';

interface HeroProps {
  title: string;
  subtitle: string;
  backgroundImage?: string;
}

export default function Hero({ title, subtitle, backgroundImage }: HeroProps) {
  const defaultBg = 'https://images.unsplash.com/photo-1452421822248-d4c2b47f0c81?ixlib=rb-4.0.3&auto=format&fit=crop&w=2074&q=80';
  
  return (
    <div 
      className="relative h-96 bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${backgroundImage || defaultBg})`
      }}
    >
      <div className="absolute inset-0 flex flex-col justify-center items-center">
        <h1 className="hero-title mb-4">
          {title}
        </h1>
        <p className="hero-subtitle">
          {subtitle}
        </p>
      </div>
      
      {/* Animated particles effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="particle particle-1"></div>
        <div className="particle particle-2"></div>
        <div className="particle particle-3"></div>
      </div>
    </div>
  );
}

// Add particle animation styles
const particleStyles = `
  .particle {
    position: absolute;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    pointer-events: none;
    animation: float 6s ease-in-out infinite;
  }
  
  .particle-1 {
    width: 4px;
    height: 4px;
    top: 20%;
    left: 20%;
    animation-delay: 0s;
  }
  
  .particle-2 {
    width: 6px;
    height: 6px;
    top: 60%;
    right: 25%;
    animation-delay: 2s;
  }
  
  .particle-3 {
    width: 3px;
    height: 3px;
    bottom: 30%;
    left: 70%;
    animation-delay: 4s;
  }
  
  @keyframes float {
    0%, 100% { transform: translateY(0px) scale(1); opacity: 0.7; }
    50% { transform: translateY(-20px) scale(1.1); opacity: 1; }
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = particleStyles;
  document.head.appendChild(styleSheet);
} 