import { useState } from 'react';

import { ak, bookings, mk, renderResort } from '@/__fixtures__/ll';
import ParkContext from '@/contexts/ParkContext';
import PlansContext from '@/contexts/PlansContext';
import BookingDateProvider from '@/providers/BookingDateProvider';
import { TOMORROW, click, screen, see, setTime } from '@/testing';

import BookingDateSelect from './Home/BookingDateSelect';

function BookingDateSelectTest() {
  const [park, setPark] = useState(mk);

  return (
    <PlansContext
      value={{
        plans: bookings,
        refreshPlans: () => {},
        pollPlans: async () => {},
        loaderElem: null,
      }}
    >
      <ParkContext value={{ park, setPark }}>
        <BookingDateProvider>
          {park.name}
          <BookingDateSelect />
        </BookingDateProvider>
      </ParkContext>
    </PlansContext>
  );
}

function renderComponent() {
  renderResort(<BookingDateSelectTest />);
}

describe('BookingDateSelect', () => {
  it('renders date selector', () => {
    setTime('10:00');
    renderComponent();
    click('Today');
    see('October');
    click('2');
    see(ak.name);

    click('10/2');
    expect(
      screen.getByRole('form', { name: 'Booking Date Selection' })
    ).toHaveFormValues({
      bookingDate: TOMORROW,
    });
    click('1');
    see('Today');
    see(mk.name);
  });

  it('spans months when necessary', () => {
    setTime('10:00', 14 * 24 * 60);
    renderComponent();
    click('Today');
    see('October – November');
    see('15');
    click('5');
    see('11/5');
  });
});
