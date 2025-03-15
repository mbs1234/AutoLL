import { render, screen, see } from '@/testing';

import { Time } from './Time';

describe('Time', () => {
  it('shows time in HH:MM AM/PM format', () => {
    render(<Time>12:45:20</Time>);
    see.time('12:45 PM');
  });

  it('formats time with leading zero', () => {
    render(<Time>06:16</Time>);
    see.time('6:16 AM');
  });

  it('formats time with single-digit hour', () => {
    render(<Time>7:30</Time>);
    see.time('7:30 AM');
  });

  it('shows hour when given single-digit integer', () => {
    render(<Time>8</Time>);
    see.time('8 AM');
  });

  it('shows hour when given two-digit integer', () => {
    render(<Time>08</Time>);
    see.time('8 AM');
  });

  it('shows PM hour when given two-digit integer', () => {
    render(<Time>15</Time>);
    see.time('3 PM');
  });

  it('shows content as-is if not a valid time string', () => {
    jest.spyOn(console, 'error').mockImplementationOnce(() => {});
    render(<Time>10:30-ish</Time>);
    see('10:30-ish');
    expect(screen.queryByRole('time')).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });
});
