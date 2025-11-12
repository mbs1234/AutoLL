import { use } from 'react';

import { Booking, isLLMP } from '@/api/itinerary';
import BookingDateContext from '@/contexts/BookingDateContext';
import ClientsContext from '@/contexts/ClientsContext';
import NavContext, { NavError } from '@/contexts/NavContext';
import ParkContext from '@/contexts/ParkContext';
import RebookingContext from '@/contexts/RebookingContext';
import { parkDate } from '@/datetime';

import Button from '../Button';
import BookExperience from './screens/BookExperience';
import Home from './screens/Home';

type Props = Parameters<typeof Button>[0] & {
  booking: Booking;
};

export default function ModifyButton({ booking, ...buttonProps }: Props) {
  const { ll } = use(ClientsContext);
  const { goBack } = use(NavContext);
  const { park, setPark } = use(ParkContext);
  const { setBookingDate } = use(BookingDateContext);
  const rebooking = use(RebookingContext);

  const goHome = () => goBack({ screen: Home, props: { tabName: 'LL' } });

  return ll.rules.book &&
    booking.modifiable &&
    !rebooking.auto &&
    isLLMP(booking) ? (
    <Button
      {...buttonProps}
      onClick={async () => {
        rebooking.begin(booking);
        const today = parkDate();
        const newDate = parkDate(booking.start);
        setBookingDate(newDate);
        if (!ll.rules.parkModify || newDate > today) {
          setPark(booking.park);
          if (park !== booking.park) return goHome();
        }
        try {
          await goBack({ screen: BookExperience });
        } catch (error) {
          if (!(error instanceof NavError)) throw error;
          await goHome();
        }
      }}
    >
      Modify
    </Button>
  ) : null;
}
