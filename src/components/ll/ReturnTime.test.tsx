import { ParkTime, formatDate } from '@/datetime';
import { TODAY, TOMORROW, render, setTime } from '@/testing';

import ReturnTime from './ReturnTime';

setTime('09:00');

describe('ReturnTime', () => {
  it('shows return time details', () => {
    const { container } = render(
      <ReturnTime
        start={{ date: TODAY, time: new ParkTime(10) }}
        end={{ date: TODAY, time: new ParkTime(11) }}
      />
    );
    expect(container).toHaveTextContent('Arrive by: 10:00 AM – 11:00 AM');
  });

  it('shows return time that is valid until the next day', () => {
    const { container } = render(
      <ReturnTime
        start={{ date: TODAY, time: new ParkTime(10) }}
        end={{ date: TOMORROW, time: new ParkTime(11) }}
      />
    );
    expect(container).toHaveTextContent(
      'Arrive by: 10:00 AM – ' + formatDate(TOMORROW, 'short')
    );
  });

  it('shows return time from park open to close', () => {
    const { container } = render(
      <ReturnTime start={{ date: TODAY }} end={{ date: TODAY }} />
    );
    expect(container).toHaveTextContent('Arrive by: Park Open – Park Close');
  });
});
