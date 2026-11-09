import { defineConfig } from 'vitest/config';

import { coverageSettings } from '../../vitest.coverage';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/test-temp-folder.test-support.ts'],
    // main.ts only binds the port; everything it composes is covered through the app. demo.ts is the seeded
    // instance scripts/demo.sh serves for screenshots.
    coverage: coverageSettings({ lines: 95, branches: 90 }, ['src/main.ts', 'src/demo.ts']),
  },
});
