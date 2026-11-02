// The coverage settings every Vitest package shares: v8 over its sources, never its tests or their support files.
// Each package adds its own floor and any setup or bootstrap modules of its own.
export function coverageSettings(thresholds: { lines: number; branches: number }, extraExcludes: string[] = []) {
  return {
    provider: 'v8' as const,
    thresholds,
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.test-support.{ts,tsx}', ...extraExcludes],
  };
}
