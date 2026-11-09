import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DashboardRouter } from './dashboard-router';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');
createRoot(root).render(
  <StrictMode>
    <DashboardRouter />
  </StrictMode>,
);
