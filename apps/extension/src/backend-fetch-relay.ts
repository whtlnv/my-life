import type { FetchFunction } from './fetch-function';

interface BackendFetchRelayOptions {
  fetch: FetchFunction;
  backendUrl: string;
}

export interface BackendFetchMessage {
  type: 'backend-fetch';
  path: string;
  method: string;
  body?: string;
}

export interface BackendFetchAnswer {
  status: number;
  body: unknown;
}

export async function answerBackendFetch(
  options: BackendFetchRelayOptions,
  message: BackendFetchMessage,
): Promise<BackendFetchAnswer> {
  const response = await options.fetch(`${options.backendUrl}${message.path}`, {
    method: message.method,
    body: message.body ?? null,
  });
  return { status: response.status, body: await response.json() };
}

// A fetch for the WhatsApp content script: the web.whatsapp.com page cannot reach the local backend itself
// (cross-origin and private-network rules), so each request travels to the background as a backend-fetch message.
export function relayedFetch(
  sendToBackground: (message: BackendFetchMessage) => Promise<BackendFetchAnswer>,
): FetchFunction {
  return async (input, init) => {
    const path = input instanceof Request ? input.url : input.toString();
    const body = typeof init?.body === 'string' ? init.body : undefined;
    const message: BackendFetchMessage = { type: 'backend-fetch', path, method: init?.method ?? 'GET' };
    const answer = await sendToBackground(body === undefined ? message : { ...message, body });
    return Response.json(answer.body, { status: answer.status });
  };
}
