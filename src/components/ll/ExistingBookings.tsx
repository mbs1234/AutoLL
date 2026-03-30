import { use } from 'react';

import { isLLMP } from '@/api/itinerary';
import { Experience } from '@/api/resort';
import BookingDateContext from '@/contexts/BookingDateContext';
import PlansContext from '@/contexts/PlansContext';
import { parkDate } from '@/datetime';

import ReturnWindow from './ReturnWindow';

export default function ExistingBookings({
  experience,
}: {
  experience: Pick<Experience, 'tier'>;
}) {
  const { plans } = use(PlansContext);
  const { bookingDate } = use(BookingDateContext);
  const bookings = plans
    .filter(isLLMP)
    .filter(b => parkDate(b.start) === bookingDate);

  if (bookings.length === 0) return null;

  return (
    <div className="mt-3 rounded-sm border border-gray-300 bg-gray-50 text-sm">
      <div className="px-2 py-1 bg-gray-200 font-semibold text-xs uppercase">
        Your Lightning Lanes
      </div>
      <ul className="divide-y divide-gray-200">
        {bookings.map(b => {
          const sameTier =
            experience.tier !== undefined &&
            b.experience.tier === experience.tier;
          return (
            <li
              key={b.id}
              className={`px-2 py-1 flex justify-between items-center ${sameTier ? 'bg-yellow-50' : ''}`}
            >
              <span className={sameTier ? 'font-semibold' : ''}>
                {b.name}
                {b.experience.tier !== undefined && (
                  <span className="ml-1 text-xs text-gray-500">
                    T{b.experience.tier}
                  </span>
                )}
              </span>
              <span className="text-xs whitespace-nowrap ml-2">
                <ReturnWindow {...b} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
