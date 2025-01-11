import { use } from 'react';

import { ak, ep, mk, renderResort } from '@/__fixtures__/ll';
import Screen from '@/components/Screen';
import BookingDateContext from '@/contexts/BookingDateContext';
import ParkContext from '@/contexts/ParkContext';
import { TODAY, TOMORROW, click, loading, see } from '@/testing';

import ParkProvider from './ParkProvider';
import PlansProvider from './PlansProvider';

function ParkConsumer() {
  const { park, setPark } = use(ParkContext);
  return (
    <Screen title={park.name}>
      <button onClick={() => setPark(ep)}>Hop to {ep.name}</button>
    </Screen>
  );
}

function Test({ date = TODAY }: { date?: string }) {
  return (
    <PlansProvider>
      <BookingDateContext
        value={{ bookingDate: date, setBookingDate: () => {} }}
      >
        <ParkProvider>
          <ParkConsumer />
        </ParkProvider>
      </BookingDateContext>
    </PlansProvider>
  );
}

describe('ParkProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves selected park', async () => {
    const { unmount } = renderResort(<Test />);
    await loading();
    await see.screen(mk.name);
    click(`Hop to ${ep.name}`);
    await see.screen(ep.name);

    unmount();
    renderResort(<Test />);
    await see.screen(ep.name);
  });

  it('loads park based on plans', async () => {
    renderResort(<Test date={TOMORROW} />);
    await loading();
    await see.screen(ak.name);
  });
});
