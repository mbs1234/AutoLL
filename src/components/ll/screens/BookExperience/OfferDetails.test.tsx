import { offer, renderResort } from '@/__fixtures__/ll';
import { Offer } from '@/api/ll';
import { click, nav, see, setTime } from '@/testing';

import SelectReturnTime from '../SelectReturnTime';
import OfferDetails from './OfferDetails';

setTime('09:00');
const onOfferChange = jest.fn();

function renderComponent(offer: Offer) {
  renderResort(
    <nav.Provider>
      <OfferDetails offer={offer} onOfferChange={onOfferChange} />
    </nav.Provider>
  );
}

describe('OfferDetails', () => {
  it('renders offer details', async () => {
    renderComponent(offer);
    see.time(offer.start.time);
    see.time(offer.end.time);
    click('Change');
    expect(nav.goTo).toHaveBeenCalledWith(
      <SelectReturnTime offer={offer} onOfferChange={onOfferChange} />
    );
  });

  it('tells if offer has been changed', async () => {
    renderComponent({ ...offer, changed: true });
    see('Return Time Changed');
  });
});
