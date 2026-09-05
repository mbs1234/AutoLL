import { JsonOK, fetchJson } from '@/fetch';
import { RateLimit } from '@/ratelimit';

import { authStore } from './auth';
import { Resort } from './resort';

export class InvalidOrigin extends Error {
  name = 'InvalidOrigin';
}

export class RequestError extends Error {
  name = 'RequestError';

  constructor(
    public response: Awaited<ReturnType<typeof fetchJson>>,
    message = 'Request failed'
  ) {
    super(`${message}: ${JSON.stringify(response)}`);
  }
}

export abstract class ApiClient {
  protected resort: Resort;
  protected origin: string;
  protected rateLimit = new RateLimit(5);

  protected static origins = {
    WDW: 'https://disneyworld.disney.go.com',
    DLR: 'https://disneyland.disney.go.com',
  };

  static originToResortId(origin: string): Resort['id'] {
    const entries = Object.entries(this.origins) as [Resort['id'], string][];
    const id = entries.find(([, o]) => o === origin)?.[0];
    if (id) return id;
    throw new InvalidOrigin(origin);
  }

  constructor(resort: Resort) {
    this.resort = resort;
    this.origin = (this.constructor as typeof ApiClient).origins[
      this.resort.id
    ];
  }

  protected async request<T = any>(request: {
    path: string;
    method?: 'GET' | 'POST' | 'DELETE';
    params?: { [key: string]: string };
    data?: unknown;
    key?: string;
    ignoreUnauth?: boolean;
  }): Promise<JsonOK<T>> {
    this.rateLimit.enforce();
    const { swid, accessToken } = authStore.getData();
    const url = this.origin + request.path;
    const res = await fetchJson(url, {
      method: request.method,
      params: request.params,
      data: request.data,
      // The fetch default, rather than `fetchJson`'s `omit`. bg1 runs injected
      // into Disney's own page, so these calls are same-origin and the browser
      // already holds that origin's cookies from the user's real session --
      // including the ones Disney's CDN sets to tell a browser apart from a
      // bare client. Omitting them made every request look like something no
      // browser would send, which is a bot signal in itself. Scoped here
      // rather than changed in `fetchJson`, because that is also used for the
      // cross-origin time-sync and live-data calls, which have no business
      // receiving cookies.
      credentials: 'same-origin',
      headers: {
        'Accept-Language': 'en-US',
        Authorization: `BEARER ${accessToken}`,
        'x-user-id': swid,
      },
    });
    if (res.status === 401 && !request.ignoreUnauth) {
      setTimeout(() => authStore.deleteData());
    } else {
      const { key } = request;
      if (res.ok && (!key || res.data[key])) {
        return { ...res, data: key ? res.data[key] : res.data };
      }
    }
    throw new RequestError(res);
  }
}
