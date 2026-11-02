import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

import { coverageSettings } from '../../vitest.coverage';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['src/**/*.test.ts'],
    // Entrypoints are Chrome's to run; what they call is covered as plain modules.
    coverage: coverageSettings({ lines: 95, branches: 90 }, ['src/entrypoints/**']),
  },
});
