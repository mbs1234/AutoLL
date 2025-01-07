import { use } from 'react';

import { Booking } from '@/api/itinerary';
import BookingDateContext from '@/contexts/BookingDateContext';
import { parkDate } from '@/datetime';

import { Day } from '../Day';

export default function BookingDate({
  booking,
}: {
  booking?: Pick<Booking, 'start'>;
}) {
  const { bookingDate } = use(BookingDateContext);
  return <Day>{booking ? parkDate(booking.start) : bookingDate}</Day>;
}
