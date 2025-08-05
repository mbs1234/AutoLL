import { use, useCallback } from 'react';

import { Booking, isLLMP } from '@/api/itinerary';
import { Park } from '@/api/resort';
import ParkContext from '@/contexts/ParkContext';
import PlansContext from '@/contexts/PlansContext';
import ResortContext from '@/contexts/ResortContext';
import { parkDate } from '@/datetime';

export default function useUpdateParkFromPlans() {
  const resort = use(ResortContext);
  const { setPark } = use(ParkContext);
  const { plans } = use(PlansContext);
  return useCallback(
    (date: string) => {
      const today = parkDate();
      const isToday = date === today;
      const parkIds = new Set(resort.parks.map(p => p.id));
      const isInPark = (b: Booking) => parkIds.has(b.park.id);
      let park: Park | undefined = undefined;
      for (const b of plans) {
        const bookingParkDay = parkDate(b.start);
        if (bookingParkDay < date) continue;
        if (bookingParkDay > date) break;
        if (isLLMP(b)) {
          park = b.park;
          if (!isToday) break;
        }
        if (!park && isInPark(b)) park = b.park;
      }
      setPark(prevPark => park ?? (prevPark.id ? prevPark : resort.parks[0]!));
    },
    [plans, resort, setPark]
  );
}
