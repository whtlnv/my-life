export type FetchFunction = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface AccountRequestOptions {
  fetch: FetchFunction;
  accessToken: string;
  accountEmail: string;
  backendUrl: string;
}
