import { createBooking, hm } from '@/__fixtures__/ll';
import { LLMP, Reservation, isLLMP } from '@/api/itinerary';
import { Overlap } from '@/api/ll/wdw';
import PlansContext from '@/contexts/PlansContext';
import { DateTime, ParkTime } from '@/datetime';
import { TODAY, render, see, setTime } from '@/testing';

import OverlappingPlans from './OverlappingPlans';

setTime('09:00');

function renderComponent(plans: (LLMP | Reservation)[]) {
  const itinerary = plans.map(b => ({
    facilityId: b.facilityId,
    startTime: b.start.time,
    overlap: new Overlap({
      startTime: b.start.time,
      endTime: b.end?.time,
      showTimeInfo: isLLMP(b) ? b.showTimeInfo : undefined,
    }),
  }));
  return render(
    <PlansContext
      value={{
        plans,
        refreshPlans: () => {},
        pollPlans: async () => [],
        loaderElem: null,
      }}
    >
      <OverlappingPlans
        offer={{
          start: new DateTime(TODAY, new ParkTime(12)),
          end: new DateTime(TODAY, new ParkTime(13)),
          itinerary,
        }}
      />
    </PlansContext>
  );
}

describe('OverlappingPlans', () => {
  it('shows overlap warning when a plan overlaps', async () => {
    const booking = createBooking(hm, { startTime: new ParkTime(12, 35) });
    renderComponent([booking]);
    see('Overlapping Plans');
    see(hm.name);
    see.time(booking.start.time);
    see.time(booking.end.time);
    see.no('Show Time:');
  });

  it('shows show times for overlapping entertainment', async () => {
    const booking = createBooking(hm, {
      startTime: new ParkTime(12, 35),
      properties: {
        showTimeInfo: {
          showStartTime: new ParkTime(12, 40),
          showEndTime: new ParkTime(13, 5),
        },
      },
    });
    renderComponent([booking]);
    see('Overlapping Plans');
    see.time(booking.start.time);
    see.time(booking.end.time);
    see('Show Time:');
    see.time('12:40:00');
    see.time('13:05:00');
  });

  it('does not show warning if no overlap', async () => {
    const booking = createBooking(hm, { startTime: new ParkTime(12, 40) });
    const { container } = renderComponent([booking]);
    expect(container).toBeEmptyDOMElement();
  });

  it('ignores offer itinerary items that do not exist in Plans context', async () => {
    const { container } = render(
      <OverlappingPlans
        offer={{
          start: new DateTime(TODAY, new ParkTime(12)),
          end: new DateTime(TODAY, new ParkTime(13)),
          itinerary: [
            {
              facilityId: '0',
              startTime: new ParkTime(11, 45),
              endTime: new ParkTime(12, 45),
              overlap: new Overlap({
                startTime: new ParkTime(11, 5),
                endTime: new ParkTime(12, 25),
              }),
            },
          ],
        }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
