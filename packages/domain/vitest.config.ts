import { defineConfig } from 'vitest/config';

import { coverageSettings } from '../../vitest.coverage';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: coverageSettings({ lines: 95, branches: 90 }),
  },
});
