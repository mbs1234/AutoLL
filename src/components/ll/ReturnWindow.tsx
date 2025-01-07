import { Booking } from '@/api/itinerary';
import { parkDate } from '@/datetime';

import { Day } from '../Day';
import { Time } from '../Time';

export default function ReturnWindow({
  start,
  end,
}: Pick<Booking, 'start' | 'end'>) {
  const startParkDate = parkDate(start);
  const endParkDate = parkDate(end);

  return (
    <span className="whitespace-nowrap">
      {start.time ? <Time>{start.time}</Time> : <span>Park Open</span>}
      {end ? (
        <>
          {' – '}
          {endParkDate > startParkDate ? (
            <Day type="short">{endParkDate}</Day>
          ) : end.time ? (
            <Time>{end.time}</Time>
          ) : (
            <span>Park Close</span>
          )}
        </>
      ) : null}
    </span>
  );
}
