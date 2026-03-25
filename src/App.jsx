import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { VirtualTour } from './components/VirtualTour';

export default function App() {
  return (
    <BrowserRouter>
      <VirtualTour className="absolute top-0 left-0 w-full h-screen" />
    </BrowserRouter>
  );
}
