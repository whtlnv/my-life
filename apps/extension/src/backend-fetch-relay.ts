import type { FetchFunction } from './fetch-function';

interface BackendFetchRelayOptions {
  fetch: FetchFunction;
  backendUrl: string;
}

interface BackendFetchMessage {
  type: 'backend-fetch';
  path: string;
  method: string;
  body: string;
}

interface BackendFetchAnswer {
  status: number;
  body: unknown;
}

export async function answerBackendFetch(
  options: BackendFetchRelayOptions,
  message: BackendFetchMessage,
): Promise<BackendFetchAnswer> {
  const response = await options.fetch(`${options.backendUrl}${message.path}`, {
    method: message.method,
    body: message.body,
  });
  return { status: response.status, body: await response.json() };
}
