import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { AppShell, routes } from './app-shell';
import { DashboardApp } from './dashboard-app';
import './styles.css';
import { TriagePage } from './triage-page';

// One local page, two views (CLAUDE.md locked decision 10): the now view at `/` and the triage queue at `#/triage`.
function App() {
  const [route, setRoute] = useState(window.location.hash);
  useEffect(() => {
    const readRoute = () => {
      setRoute(window.location.hash);
    };
    window.addEventListener('hashchange', readRoute);
    return () => {
      window.removeEventListener('hashchange', readRoute);
    };
  }, []);
  return <AppShell route={route}>{route === routes.triage ? <TriagePage /> : <DashboardApp />}</AppShell>;
}

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
