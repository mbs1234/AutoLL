import { ll, modOffer, offer, renderResort, times } from '@/__fixtures__/ll';
import { HourlySlots, Offer } from '@/api/ll';
import { displayTime } from '@/datetime';
import { click, loading, nav, see } from '@/testing';

import SelectReturnTime from './SelectReturnTime';

jest.useFakeTimers();
const onOfferChange = jest.fn();

async function renderComponent(
  times: HourlySlots,
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
    `Arrive by: ${displayTime(start.time ?? '')} – ${displayTime(end.time ?? '')}`
  );
  return view;
}

async function addedOfferTime(times: HourlySlots) {
  await renderComponent(times, modOffer);
  see(displayTime(offer.start.time), 'button');
}

describe('SelectReturnTime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows return time selection', async () => {
    await renderComponent(times);
    see('11 AM', 'rowheader');
    see('12 PM', 'rowheader');
    for (const slots of times) {
      for (const { startTime } of slots) {
        see(displayTime(startTime), 'button');
      }
    }
    const slot = times[1][1];
    const newOffer = {
      ...offer,
      offerId: offer.id + '-new',
      offerSetId: offer.offerSetId + '-new',
      start: { ...offer.start, time: slot.startTime },
      end: { ...offer.end, time: slot.endTime },
    };
    jest.spyOn(ll, 'changeOfferTime').mockResolvedValueOnce(newOffer);
    click(displayTime(slot.startTime));
    await loading();
    expect(nav.goBack).toHaveBeenCalledTimes(1);
    expect(onOfferChange).toHaveBeenCalledWith(newOffer);

    click('Keep');
    expect(nav.goBack).toHaveBeenCalledTimes(2);
  });

  it('replaces earliest slot with offer time if offer time is earlier', async () => {
    await addedOfferTime(times);
    see.no(displayTime('11:20'), 'button');
    click(displayTime(offer.start.time));
    await loading();
    expect(onOfferChange).toHaveBeenCalledWith(modOffer);
    expect(ll.changeOfferTime).not.toHaveBeenCalled();
  });

  it("doesn't replace earliest slot if offer time is later", async () => {
    const startTime = '11:05:00';
    await renderComponent(
      [[{ startTime, endTime: '12:05:00' }, ...times[0].slice(1)], times[1]],
      offer
    );
    see(displayTime(startTime), 'button');
    see.no(displayTime(offer.start.time), 'button');
  });

  it('adds offer time button if 1-2 slots for this hour', async () => {
    await addedOfferTime([times[0].slice(1), times[1]]);
    for (const { startTime } of times[0]) see(displayTime(startTime), 'button');
  });

  it('adds offer time if no slots for this hour', async () => {
    await addedOfferTime(times.slice(1));
  });

  it('adds offer time if no other slots', async () => {
    await addedOfferTime([]);
  });

  it('shows "no other times availble" if no times', async () => {
    await renderComponent([]);
    see('No other times available');
  });
});
