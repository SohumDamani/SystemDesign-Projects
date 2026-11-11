import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';
import { App } from './App';
import { ProgressProvider } from './core/progress';
import { ErrorBoundary } from './ui/ErrorBoundary';

// A clean link like /start or /learn/cache should land on that page, not silently on Home.
// The site is static files, so routes live after the hash; this turns one form into the other.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const extra = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : '';
if (extra && extra !== '/' && !location.hash) history.replaceState(null, '', `${base}/#${extra}${location.search}`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ErrorBoundary what="The site">
        <ProgressProvider>
          <App />
        </ProgressProvider>
      </ErrorBoundary>
    </HashRouter>
  </StrictMode>,
);
