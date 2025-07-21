import { ll, modOffer, offer, renderResort, times } from '@/__fixtures__/ll';
import { HourlyTimes, Offer } from '@/api/ll';
import { formatTime } from '@/datetime';
import { click, loading, nav, see } from '@/testing';

import SelectReturnTime from './SelectReturnTime';

jest.useFakeTimers();
const onOfferChange = jest.fn();

async function renderComponent(
  times: HourlyTimes,
  currentOffer: Offer = offer
) {
  jest.spyOn(ll, 'times').mockResolvedValueOnce(times);
  const view = renderResort(
    <nav.Provider>
      <SelectReturnTime offer={currentOffer} onOfferChange={onOfferChange} />
    </nav.Provider>
  );
  await loading();
  const { start, end } = currentOffer.booking ?? currentOffer;
  expect(view.container).toHaveTextContent(
    `Arrive by: ${formatTime(start.time ?? '')} – ${formatTime(end.time ?? '')}`
  );
  return view;
}

async function addedOfferTime(times: HourlyTimes) {
  await renderComponent(times, modOffer);
  see(formatTime(offer.start.time), 'button');
}

describe('SelectReturnTime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows return time selection', async () => {
    await renderComponent(times);
    see('11 AM', 'rowheader');
    see('12 PM', 'rowheader');
    times.flat().forEach(t => see(formatTime(t), 'button'));
    const time = '11:40:00';
    const newOffer = {
      ...offer,
      offerId: offer.id + '-new',
      offerSetId: offer.offerSetId + '-new',
      start: { ...offer.start, time },
      end: { ...offer.end, time: '12:40:00' },
    };
    jest.spyOn(ll, 'changeOfferTime').mockResolvedValueOnce(newOffer);
    click(formatTime(time));
    await loading();
    expect(nav.goBack).toHaveBeenCalledTimes(1);
    expect(onOfferChange).toHaveBeenCalledWith(newOffer);

    click('Keep');
    expect(nav.goBack).toHaveBeenCalledTimes(2);
  });

  it('replaces earliest slot with offer time if offer time is earlier', async () => {
    await addedOfferTime(times);
    see.no(formatTime('11:20'), 'button');
    click(formatTime(offer.start.time));
    await loading();
    expect(onOfferChange).toHaveBeenCalledWith(modOffer);
    expect(ll.changeOfferTime).not.toHaveBeenCalled();
  });

  it("doesn't replace earliest slot if offer time is later", async () => {
    const time = '11:05:00';
    await renderComponent([[time, ...times[0].slice(1)], times[1]], offer);
    see(formatTime(time), 'button');
    see.no(formatTime(offer.start.time), 'button');
  });

  it('adds offer time button if 1-2 times for this hour', async () => {
    await addedOfferTime([times[0].slice(1), times[1]]);
    times[0].slice(1).forEach(t => see(formatTime(t), 'button'));
  });

  it('adds offer time if no times for this hour', async () => {
    await addedOfferTime(times.slice(1));
  });

  it('adds offer time if no other times', async () => {
    await addedOfferTime([]);
  });

  it('shows "no other times availble" if no times', async () => {
    await renderComponent([]);
    see('No other times available');
  });
});
