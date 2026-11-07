import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { DashboardApp } from './dashboard-app';
import { TriagePage } from './triage-page';

const triageRoute = '#/triage';

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
  return (
    <>
      <nav>
        <a href="#/">Now</a> · <a href={triageRoute}>Triage</a>
      </nav>
      {route === triageRoute ? <TriagePage /> : <DashboardApp />}
    </>
  );
}

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
