import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DashboardApp } from './dashboard-app';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');
createRoot(root).render(
  <StrictMode>
    <DashboardApp />
  </StrictMode>,
);
