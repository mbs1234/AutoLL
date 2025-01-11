import { RateLimit, RateLimitExceeded } from '@/ratelimit';

jest.useFakeTimers();
jest.advanceTimersByTime(1000);

describe('RateLimit', () => {
  it('throws RateLimitExceeded when appropriate', async () => {
    const reqsPerSec = 5;
    const limit = new RateLimit(reqsPerSec);
    for (let i = 0; i < reqsPerSec; ++i) limit.enforce();
    expect(() => limit.enforce()).toThrow(RateLimitExceeded);
  });
});
