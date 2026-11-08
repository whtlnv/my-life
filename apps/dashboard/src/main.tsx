import { StrictMode, useEffect, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';

import { AppShell, routes } from './app-shell';
import { CategoriesPage } from './categories-page';
import { DashboardApp } from './dashboard-app';
import { FiltersPage } from './filters-page';
import { StatementPage } from './statement-page';
import './styles.css';
import { TriagePage } from './triage-page';

// One local page (CLAUDE.md locked decision 10): the now view at `/`, the triage queue at `#/triage`, and the
// Phase 2 pages: categories, filters and the weekly expense statement.
const pages: Record<string, ComponentType> = {
  [routes.triage]: TriagePage,
  [routes.categories]: CategoriesPage,
  [routes.filters]: FiltersPage,
  [routes.statement]: StatementPage,
};

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
  const Page = pages[route] ?? DashboardApp;
  return (
    <AppShell route={route}>
      <Page />
    </AppShell>
  );
}

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
