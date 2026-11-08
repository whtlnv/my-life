import type { createApp } from '@my-life/backend/app';

type Backend = ReturnType<typeof createApp>;

// The extension's fetch as the integration tests wire it: requests to one Google origin go to that API's fake
// server, everything else to the backend app in process.
export function extensionFetchRoutingTo(googleOrigin: string, fakeServerUrl: string, backend: Backend): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.origin === googleOrigin) {
      return fetch(new URL(url.pathname + url.search, fakeServerUrl), init);
    }
    return backend.request(url.pathname + url.search, init);
  };
}
