import { useEffect, useState, type ComponentType } from 'react';

import { AgentPage } from './agent-page';
import { AppShell, routes } from './app-shell';
import { CategoriesPage } from './categories-page';
import { DashboardApp } from './dashboard-app';
import { FiltersPage } from './filters-page';
import { NeedsInputPage } from './needs-input-page';
import { PeoplePage } from './people-page';
import { StatementPage } from './statement-page';
import { TriagePage } from './triage-page';

// A route may carry a query (`#/people?contact=…`); the page is chosen by the part before it, and any other route is
// the Now page.
const pages: Record<string, ComponentType> = {
  [routes.people]: PeoplePage,
  [routes.needsInput]: NeedsInputPage,
  [routes.triage]: TriagePage,
  [routes.categories]: CategoriesPage,
  [routes.filters]: FiltersPage,
  [routes.statement]: StatementPage,
  [routes.agent]: AgentPage,
};

export function DashboardRouter() {
  const [hash, setHash] = useState(window.location.hash);
  const [route = ''] = hash.split('?');
  useEffect(() => {
    const readRoute = () => {
      setHash(window.location.hash);
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
