import { fetchJson } from './fetch';

jest.useFakeTimers();
self.fetch = jest.fn();

function mockFetch(body: any, headers: { [name: string]: string } = {}) {
  headers = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: () => body,
  } as Response);
}

const url = 'https://example.com/';
const signal = expect.any(AbortSignal);
const init = {
  headers: {},
  cache: 'no-store',
  credentials: 'omit',
  referrer: '',
  signal,
};

describe('fetchJson()', () => {
  beforeEach(() => {
    jest.advanceTimersByTime(10);
  });

  it('returns response', async () => {
    mockFetch({ a: 1 }, { 'content-type': 'application/json' });
    expect(await fetchJson(url)).toEqual({
      ok: true,
      status: 200,
      data: { a: 1 },
    });
  });

  it('returns empty data object for non-JSON response', async () => {
    mockFetch(null);
    expect(await fetchJson(url)).toEqual({ ok: true, status: 200, data: {} });
  });

  it('uses POST if method not specified and data included', async () => {
    const data = { name: 'Mickey' };
    await fetchJson(url, { data });
    expect(fetch).toHaveBeenLastCalledWith(url, {
      method: 'POST',
      body: JSON.stringify(data),
      ...init,
      headers: { ...init.headers, 'Content-Type': 'application/json' },
    });
  });

  // `guests`, `offerset/generate` and `entitlements/book` are all POSTs to one
  // fixed path, distinguished only by their body. Sharing a cached response
  // between two of them hands the second caller the first's answer.
  it('does not share cached POST responses with a different body', async () => {
    jest.mocked(fetch).mockClear();
    mockFetch({ ok: true }, { 'content-type': 'application/json' });
    await Promise.all([
      fetchJson(url, { data: { name: 'Mickey' } }),
      fetchJson(url, { data: { name: 'Minnie' } }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // The reason the cache exists: StrictMode double-invokes an effect, and the
  // identical request should still collapse to one.
  it('still collapses two identical requests', async () => {
    jest.mocked(fetch).mockClear();
    mockFetch({ ok: true }, { 'content-type': 'application/json' });
    await Promise.all([
      fetchJson(url, { data: { name: 'Mickey' } }),
      fetchJson(url, { data: { name: 'Mickey' } }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('adds params to URL', async () => {
    await fetchJson(url, { params: { start: 5, end: 15 } });
    expect(fetch).toHaveBeenLastCalledWith(url + '?start=5&end=15', {
      ...init,
      method: 'GET',
    });
  });

  it('returns status=0 response on timeout', async () => {
    jest.spyOn(console, 'error').mockImplementationOnce(() => null);
    const timeout = 5000;
    jest.mocked(fetch).mockImplementationOnce(((
      url: string,
      init: RequestInit
    ) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (init.signal?.aborted) {
            reject('aborted');
          } else {
            resolve({ ok: true, status: 200 } as Response);
          }
        }, timeout);
      });
    }) as typeof fetch);
    const promise = fetchJson(url, { timeout });
    jest.advanceTimersByTime(timeout);
    expect(await promise).toEqual({ ok: false, status: 0, data: null });
  });
});
