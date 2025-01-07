import { use } from 'react';

import { Day } from '@/components/Day';
import Screen from '@/components/Screen';
import PlansContext from '@/contexts/PlansContext';
import { parkDate } from '@/datetime';

import BookingListing from '../BookingListing';
import ModifyButton from '../ModifyButton';
import NoPlans from '../NoPlans';

export default function YourDay({
  date,
  unmodifiable,
}: {
  date: string;
  unmodifiable?: boolean;
}) {
  const { plans } = use(PlansContext);
  const dayPlans = plans.filter(b => parkDate(b.start) === date);
  const parks = [...new Set(dayPlans.map(b => b.park))];
  const nonAprPlans = dayPlans.filter(b => b.type !== 'APR');

  return (
    <Screen
      title="Your Day"
      subhead={<Day>{date}</Day>}
      theme={parks[0]?.theme}
    >
      {nonAprPlans && nonAprPlans.length > 0 ? (
        <ul>
          {nonAprPlans.map(b => (
            <li
              className="py-3 first:border-0 border-t-4 border-gray-300"
              key={b.bookingId}
            >
              <BookingListing
                details
                booking={b}
                button={
                  !unmodifiable && <ModifyButton booking={b} type="small" />
                }
                unmodifiable={unmodifiable}
              />
            </li>
          ))}
        </ul>
      ) : (
        <NoPlans />
      )}
    </Screen>
  );
}
