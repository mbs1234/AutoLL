import { ParkTime } from '@/datetime';
import { render, screen, see } from '@/testing';

import { Time } from './Time';

describe('Time', () => {
  it('shows time in HH:MM AM/PM format', () => {
    render(<Time time={new ParkTime(12, 45, 20)} />);
    see.time('12:45 PM');
  });

  it('formats time with leading zero', () => {
    render(<Time time="06:16" />);
    see.time('6:16 AM');
  });

  it('formats time with single-digit hour', () => {
    render(<Time time="7:30" />);
    see.time('7:30 AM');
  });

  it('shows hour when given single-digit integer', () => {
    render(<Time time="8" />);
    see.time('8 AM');
  });

  it('shows hour when given two-digit integer', () => {
    render(<Time time="08" />);
    see.time('8 AM');
  });

  it('shows PM hour when given two-digit integer', () => {
    render(<Time time="15" />);
    see.time('3 PM');
  });

  it('shows content as-is if not a valid time string', () => {
    jest.spyOn(console, 'error').mockImplementationOnce(() => {});
    render(<Time time="10:30-ish" />);
    see('10:30-ish');
    expect(screen.queryByRole('time')).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });
});
