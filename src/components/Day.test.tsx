import { TODAY, TOMORROW, render, screen, see, setTime } from '@/testing';

import { Day } from './Day';

setTime('10:00');

describe('Day', () => {
  it('shows formatted date', () => {
    render(<Day>2021-10-03</Day>);
    see('Sunday, October 3');
    expect(screen.getByRole('time')).toHaveAttribute('datetime', '2021-10-03');
  });

  it('excludes day of week when type="short"', () => {
    render(<Day type="short">2021-10-03</Day>);
    see('October 3');
  });

  it('says Today instead of day of week', () => {
    render(<Day>{TODAY}</Day>);
    see('Today, October 1');
  });

  it('says Tomorrow instead of day of week', () => {
    render(<Day>{TOMORROW}</Day>);
    see('Tomorrow, October 2');
  });

  it('shows content as-is if not a valid date string', () => {
    jest.spyOn(console, 'error').mockImplementationOnce(() => {});
    render(<Day>10/3</Day>);
    see('10/3');
    expect(screen.queryByRole('time')).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });
});
