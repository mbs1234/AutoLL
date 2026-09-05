import {
  holdScreenAwake,
  releaseScreenAwake,
  wakeLockHeld,
  wakeLockSupported,
} from './wakelock';

/** Stand-in for a `WakeLockSentinel`, including the browser-initiated release. */
function fakeSentinel() {
  const listeners: (() => void)[] = [];
  return {
    released: false,
    release: jest.fn(async function (this: { released: boolean }) {
      this.released = true;
    }),
    addEventListener: jest.fn((type: string, listener: () => void) => {
      if (type === 'release') listeners.push(listener);
    }),
    /** What the browser does when the page is hidden or the battery is low. */
    dropFromBrowser() {
      this.released = true;
      for (const listener of listeners) listener();
    },
  };
}

function installWakeLock(request: (type: string) => Promise<unknown>): {
  request: jest.Mock;
} {
  const wakeLock = { request: jest.fn(request) };
  Object.defineProperty(navigator, 'wakeLock', {
    value: wakeLock,
    configurable: true,
  });
  return wakeLock;
}

function uninstallWakeLock() {
  Reflect.deleteProperty(navigator, 'wakeLock');
}

const becomeVisible = () =>
  document.dispatchEvent(new Event('visibilitychange'));

afterEach(async () => {
  // Module-level state: leave no lock or listener behind for the next test.
  await releaseScreenAwake();
  uninstallWakeLock();
});

describe('wakeLockSupported()', () => {
  it('is false when the browser lacks the API', () => {
    expect(wakeLockSupported()).toBe(false);
  });

  it('is true once the API is present', () => {
    installWakeLock(async () => fakeSentinel());
    expect(wakeLockSupported()).toBe(true);
  });
});

describe('holdScreenAwake()', () => {
  it('requests a screen lock', async () => {
    const wakeLock = installWakeLock(async () => fakeSentinel());
    await holdScreenAwake();
    expect(wakeLock.request).toHaveBeenCalledWith('screen');
    expect(wakeLockHeld()).toBe(true);
  });

  it('does nothing when unsupported', async () => {
    await expect(holdScreenAwake()).resolves.toBeUndefined();
    expect(wakeLockHeld()).toBe(false);
  });

  it('holds only one lock at a time', async () => {
    const wakeLock = installWakeLock(async () => fakeSentinel());
    await holdScreenAwake();
    await holdScreenAwake();
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
  });

  // Rejected on a hidden document, an insecure context, or a refusal the
  // browser owes no explanation for. None of them should surface.
  it('swallows a rejected request', async () => {
    installWakeLock(async () => {
      throw new Error('not allowed');
    });
    await expect(holdScreenAwake()).resolves.toBeUndefined();
    expect(wakeLockHeld()).toBe(false);
  });

  // The case that makes this worth having: iOS drops the lock whenever the
  // page is hidden, so returning to the tab has to take it again.
  it('re-acquires after the browser drops the lock', async () => {
    const sentinel = fakeSentinel();
    const wakeLock = installWakeLock(async () => sentinel);
    await holdScreenAwake();

    sentinel.dropFromBrowser();
    expect(wakeLockHeld()).toBe(false);

    becomeVisible();
    await Promise.resolve();
    expect(wakeLock.request).toHaveBeenCalledTimes(2);
  });

  it('does not re-acquire while the lock is still held', async () => {
    const wakeLock = installWakeLock(async () => fakeSentinel());
    await holdScreenAwake();
    becomeVisible();
    await Promise.resolve();
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
  });
});

// `setEnabled` fires holdScreenAwake without awaiting it, so turning autopilot
// straight back off can land while the request is still outstanding.
describe('acquire/release races', () => {
  /** A request the test resolves by hand, to hold it open across a release. */
  function deferredRequest() {
    let grant: (sentinel: unknown) => void = () => undefined;
    const request = () =>
      new Promise(resolve => {
        grant = resolve;
      });
    return { request, grant: (s: unknown) => grant(s) };
  }

  it('gives back a lock granted after the release', async () => {
    const sentinel = fakeSentinel();
    const { request, grant } = deferredRequest();
    installWakeLock(request as (t: string) => Promise<unknown>);

    const held = holdScreenAwake();
    await releaseScreenAwake();
    grant(sentinel);
    await held;

    expect(wakeLockHeld()).toBe(false);
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('makes one request when two acquires overlap', async () => {
    const sentinel = fakeSentinel();
    const { request, grant } = deferredRequest();
    const wakeLock = installWakeLock(
      request as (t: string) => Promise<unknown>
    );

    const first = holdScreenAwake();
    const second = holdScreenAwake();
    grant(sentinel);
    await Promise.all([first, second]);

    expect(wakeLock.request).toHaveBeenCalledTimes(1);
    expect(wakeLockHeld()).toBe(true);
  });

  it('can acquire again after a release interrupted a request', async () => {
    const stranded = fakeSentinel();
    const { request, grant } = deferredRequest();
    installWakeLock(request as (t: string) => Promise<unknown>);
    const held = holdScreenAwake();
    await releaseScreenAwake();
    grant(stranded);
    await held;

    // A fresh, ordinary request must still work afterwards.
    const wanted = fakeSentinel();
    installWakeLock(async () => wanted);
    await holdScreenAwake();
    expect(wakeLockHeld()).toBe(true);
  });
});

describe('releaseScreenAwake()', () => {
  it('releases a held lock', async () => {
    const sentinel = fakeSentinel();
    installWakeLock(async () => sentinel);
    await holdScreenAwake();
    await releaseScreenAwake();
    expect(sentinel.release).toHaveBeenCalled();
    expect(wakeLockHeld()).toBe(false);
  });

  it('is safe when nothing is held', async () => {
    await expect(releaseScreenAwake()).resolves.toBeUndefined();
  });

  it('stops re-acquiring once released', async () => {
    const wakeLock = installWakeLock(async () => fakeSentinel());
    await holdScreenAwake();
    await releaseScreenAwake();
    becomeVisible();
    await Promise.resolve();
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it('survives a sentinel that refuses to release', async () => {
    const sentinel = fakeSentinel();
    sentinel.release = jest.fn(async () => {
      throw new Error('already released');
    });
    installWakeLock(async () => sentinel);
    await holdScreenAwake();
    await expect(releaseScreenAwake()).resolves.toBeUndefined();
    expect(wakeLockHeld()).toBe(false);
  });
});
