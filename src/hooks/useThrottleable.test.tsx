import { click, render, setTime } from '@/testing';

import useThrottleable from './useThrottleable';

const fn = jest.fn();

function Test() {
  const throttledFn = useThrottleable(fn);
  return (
    <div>
      <button onClick={() => throttledFn()}>0</button>
      <button onClick={() => throttledFn(1000)}>1</button>
    </div>
  );
}

describe('useThrottleable()', () => {
  beforeEach(() => {
    setTime('10:00');
  });

  it('calls throttled function as appropriate', () => {
    render(<Test />);
    click('1');
    jest.advanceTimersByTime(1);
    click('1');
    jest.advanceTimersByTime(1);
    click('0');
    jest.advanceTimersByTime(999);
    click('1');
    jest.advanceTimersByTime(1);
    click('1');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
