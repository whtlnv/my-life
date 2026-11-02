import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { coverageSettings } from '../../vitest.coverage';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    coverage: coverageSettings({ lines: 95, branches: 90 }, ['src/test-setup.ts', 'src/main.tsx']),
  },
});
