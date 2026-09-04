import { setTime } from '@/testing';

import { ping } from './ping';

const fetch = jest.fn(() => ({ ok: true, status: 204, data: {} }));
self.fetch = fetch as any;
setTime('07:00');

const ONE_HOUR = 60 * 60_000;
const ONE_DAY = 24 * ONE_HOUR;

describe('ping()', () => {
  // This fork disables the usage ping (PING_ENABLED in ./ping). Upstream's
  // test asserted one POST per day; here we assert it never phones home.
  it('never phones home', async () => {
    const wdw = { id: 'WDW' as const };
    await ping(wdw, 'G');
    jest.advanceTimersByTime(ONE_HOUR);
    await ping(wdw, 'G');
    jest.advanceTimersByTime(ONE_DAY);
    await ping(wdw, 'G');
    expect(fetch).not.toHaveBeenCalled();
  });
});
