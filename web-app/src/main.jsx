import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { startPerformanceMonitoring } from './observability/performance';

function retireLegacyServiceWorkers() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker.getRegistrations()
      .then(async (registrations) => {
        await Promise.all(registrations.map((registration) => registration.unregister()));
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter((cacheName) => /^(workbox|google-fonts-cache|gstatic-fonts-cache)/.test(cacheName))
            .map((cacheName) => caches.delete(cacheName)),
        );
      })
      .catch((error) => {
        console.warn('Unable to retire a legacy service worker:', error);
      });
  }, { once: true });
}

retireLegacyServiceWorkers();
startPerformanceMonitoring();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
