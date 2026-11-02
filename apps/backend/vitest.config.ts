import { defineConfig } from 'vitest/config';

import { coverageSettings } from '../../vitest.coverage';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // main.ts only binds the port; everything it composes is covered through the app.
    coverage: coverageSettings({ lines: 95, branches: 90 }, ['src/main.ts']),
  },
});
