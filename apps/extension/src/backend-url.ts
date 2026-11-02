// Where this profile's extension reports to. Localhost only (CLAUDE.md locked decision 19).
export const defaultBackendUrl = 'http://127.0.0.1:7777';

export function backendUrl(configured: string | undefined): string {
  return configured === undefined || configured === '' ? defaultBackendUrl : configured.replace(/\/+$/, '');
}
