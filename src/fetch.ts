export type JsonOK<T = any> = { ok: true; status: number; data: T };

export type JsonResponse<T = any> =
  | JsonOK<T>
  | { ok: false; status: number; data: any };

const DEFAULT_TIMEOUT_MS = 8000;

export async function fetchJson<T = any>(
  url: string,
  init: RequestInit & {
    params?: { [key: string]: string | number };
    data?: unknown;
    timeout?: number;
  } = {}
): Promise<JsonResponse<T>> {
  const { params, data, timeout = DEFAULT_TIMEOUT_MS, ...fetchInit } = init;
  init = fetchInit;
  init.referrer ||= '';
  init.credentials ||= 'omit';
  init.cache ||= 'no-store';
  init.headers = {
    ...(init.headers || {}),
  };
  if (params && Object.keys(params).length > 0) {
    url +=
      (url.includes('?') ? '&' : '?') +
      Object.entries(params)
        .filter(([, v]) => v !== '')
        .map(kv => kv.map(encodeURIComponent).join('='))
        .join('&');
  }
  if (data) {
    init.method ||= 'POST';
    init.headers = {
      ...init.headers,
      'Content-Type': 'application/json',
    };
    init.body = JSON.stringify(data);
  }
  init.method ||= 'GET';

  return checkCache(url, init, async () => {
    const controller = new AbortController();
    init.signal = controller.signal;
    const abort = () => controller.abort();
    const timeoutId = setTimeout(abort, timeout);
    let response: Response;

    try {
      response = await fetch(url, init);
    } catch (error) {
      console.error(error);
      return { ok: false, status: 0, data: null };
    } finally {
      clearTimeout(timeoutId);
    }
    return {
      ok: response.ok,
      status: response.status,
      data: (response.headers.get('Content-Type') || '').startsWith(
        'application/json'
      )
        ? await response.json()
        : {},
    };
  });
}

// This cache is only for preventing duplicate requests in React StrictMode
const cache: { [key: string]: Promise<JsonResponse> } = {};

function checkCache(
  url: string,
  init: RequestInit,
  requester: () => Promise<JsonResponse>
) {
  // Keyed on everything that can change the answer, not just where it is sent.
  //
  // The old key was `method + url`, which is wrong for this API: `guests`,
  // `offerset/generate` and `entitlements/book` are all POSTs to one fixed
  // path with the attraction, the party or the offer carried in the *body*.
  // Two of them issued inside the 10ms window therefore collapsed to one
  // request, and the second caller silently received the first's response --
  // eligibility for the wrong attraction, which is how a booking ends up made
  // for the wrong party. Reachable because the autopilot tick runs on a timer
  // and can interleave with a screen the user just opened.
  //
  // Bodies that cannot be compared exactly are not cached at all rather than
  // guessed at. Headers are included because a response can depend on them,
  // which also means a request carrying sensor data never dedupes -- correct,
  // since two deliberate booking attempts must not collapse into one.
  if (init.body !== undefined && typeof init.body !== 'string') {
    return requester();
  }
  const headers = [...new Headers(init.headers).entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const key = JSON.stringify([init.method, url, init.body ?? null, headers]);
  const entry = cache[key];
  if (entry) return entry;
  const response = requester();
  cache[key] = response;
  setTimeout(() => {
    delete cache[key];
  }, 10);
  return response;
}
