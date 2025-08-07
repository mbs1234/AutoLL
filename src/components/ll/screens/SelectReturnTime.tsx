import { use, useCallback, useEffect, useState } from 'react';

import { HourlyTimes, Offer } from '@/api/ll';
import Button from '@/components/Button';
import LandLine from '@/components/LandLine';
import Screen from '@/components/Screen';
import { Time } from '@/components/Time';
import ClientsContext from '@/contexts/ClientsContext';
import NavContext from '@/contexts/NavContext';
import RebookingContext from '@/contexts/RebookingContext';
import { parkDate } from '@/datetime';
import useDataLoader from '@/hooks/useDataLoader';

import BookingDate from '../BookingDate';
import ReturnTime from '../ReturnTime';
import YourDayButton from '../YourDayButton';
import RefreshButton from './RefreshButton';

export default function SelectReturnTime<B extends Offer['booking']>({
  offer,
  onOfferChange,
}: {
  offer: Offer<B>;
  onOfferChange: (offer: Offer<B>) => void;
}) {
  const { goBack } = use(NavContext);
  const { ll } = use(ClientsContext);
  const rebooking = use(RebookingContext);
  const { loadData, loaderElem } = useDataLoader();
  const [times, setTimes] = useState<HourlyTimes>();
  const { booking } = offer;
  const bookingTimeChange = booking && !rebooking.current;

  const refreshTimes = useCallback(() => {
    function insertOfferTime(times: HourlyTimes) {
      const offerTime = offer.start.time;
      if (!booking || offerTime === booking.start.time) return times;
      times = [...times];
      const offerHour = offerTime.hour;
      const hours = times.map(times => times[0].hour);
      const hourIdx = hours.findIndex(hour => hour >= offerHour);
      const hour = hours[hourIdx];
      const hourTimes = [...(times[hourIdx] ?? [])];
      if (hourIdx === -1) {
        times.push([offerTime]);
      } else if (hour > offerHour) {
        times.splice(hourIdx, 0, [offerTime]);
      } else if (offerTime < hourTimes[0]) {
        if (hourTimes.length < 3) {
          hourTimes.unshift(offerTime);
        } else {
          hourTimes[0] = offerTime;
        }
        times[hourIdx] = hourTimes;
      }
      return times;
    }
    loadData(async () => {
      const times = await ll.times(offer);
      setTimes(bookingTimeChange ? insertOfferTime(times) : times);
    });
  }, [offer, booking, bookingTimeChange, ll, loadData]);

  useEffect(refreshTimes, [refreshTimes]);

  return (
    <Screen
      title="Select Return Time"
      buttons={
        <>
          <YourDayButton date={parkDate(offer.start)} unmodifiable />
          <RefreshButton name="Times" onClick={refreshTimes} />
        </>
      }
      subhead={<BookingDate booking={offer} />}
      theme={offer.experience.park.theme}
    >
      <h2>{offer.experience.name}</h2>
      <LandLine land={offer.experience.land} />
      {offer && (
        <ReturnTime
          {...(bookingTimeChange ? booking : offer)}
          button={
            <Button type="small" onClick={goBack}>
              Keep
            </Button>
          }
        />
      )}
      {!times ? null : times.length > 0 ? (
        <>
          <h3>More Available Times</h3>
          <table className="whitespace-nowrap">
            <tbody>
              {times.map(times => (
                <tr key={+times[0]}>
                  <th
                    scope="row"
                    className="pt-3 pr-2 text-gray-500 text-sm font-semibold text-right uppercase"
                  >
                    {<Time time={`${times[0].hour}`} />}
                  </th>
                  {times.map(t => (
                    <td className="pt-3 pr-3 text-center" key={+t}>
                      <Button
                        onClick={() => {
                          loadData(async () => {
                            const newOffer =
                              t === offer.start.time
                                ? offer
                                : await ll.changeOfferTime(offer, t);
                            await goBack();
                            onOfferChange(newOffer);
                          });
                        }}
                      >
                        <Time time={t} />
                      </Button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p>No other times available</p>
      )}
      {loaderElem}
    </Screen>
  );
}
