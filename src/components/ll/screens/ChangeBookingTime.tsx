import { use, useEffect, useState } from 'react';

import { LLMP, Offer } from '@/api/ll';
import Button from '@/components/Button';
import LandLine from '@/components/LandLine';
import Screen from '@/components/Screen';
import ClientsContext from '@/contexts/ClientsContext';
import NavContext from '@/contexts/NavContext';
import RebookingContext from '@/contexts/RebookingContext';
import useDataLoader from '@/hooks/useDataLoader';

import BookingDate from '../BookingDate';
import ReturnTime from '../ReturnTime';
import YourDayButton from '../YourDayButton';
import BookNewReturnTime from './BookNewReturnTime';
import RefreshButton from './RefreshButton';
import SelectReturnTime from './SelectReturnTime';

export default function ChangeBookingTime({ booking }: { booking: LLMP }) {
  const { goTo } = use(NavContext);
  const rebooking = use(RebookingContext);
  const { ll } = use(ClientsContext);
  const { loadData, loaderElem } = useDataLoader();
  const [offer, setOffer] = useState<Offer<LLMP>>();

  useEffect(() => {
    const end = rebooking.end;
    end();
  }, [rebooking.end]);

  useEffect(() => {
    loadData(async () => {
      setOffer(await ll.offer(booking.experience, booking.guests, { booking }));
    });
  }, [booking, ll, loadData]);

  return offer ? (
    <SelectReturnTime
      offer={offer}
      onOfferChange={offer => {
        goTo(<BookNewReturnTime offer={offer} />);
      }}
    />
  ) : (
    <Screen
      title="Select Return Time"
      theme={booking.park.theme}
      subhead={<BookingDate booking={booking} />}
      buttons={
        <>
          <YourDayButton />
          <RefreshButton name="Times" onClick={() => {}} />
        </>
      }
    >
      <h2>{booking.name}</h2>
      <LandLine land={booking.land} />
      <ReturnTime {...booking} button={<Button type="small">Keep</Button>} />
      {loaderElem}
    </Screen>
  );
}
