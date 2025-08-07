import { ParkTime } from '@/datetime';
import { render, see, setTime } from '@/testing';

import TimeBanner from './TimeBanner';

jest.useFakeTimers();

describe('TimeBanner', () => {
  it('shows times', async () => {
    setTime('06:59');
    render(
      <TimeBanner bookTime={new ParkTime(7)} dropTime={new ParkTime(11, 30)} />
    );
    expect(see('Book:')).toHaveTextContent('Book: 7:00 AM');
    expect(see('Drop:')).toHaveTextContent('Drop: 11:30 AM');
  });

  it('shows "now" if time is not in the future', () => {
    setTime('10:30');
    render(
      <TimeBanner
        bookTime={new ParkTime(10, 15)}
        dropTime={new ParkTime(10, 30)}
      />
    );
    expect(see('Book:')).toHaveTextContent('Book: now');
    expect(see('Drop:')).toHaveTextContent('Drop: now');
  });

  it('shows nothing if no times', async () => {
    const { container } = render(<TimeBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
