import { use } from 'react';

import { Offer } from '@/api/ll';
import PlansContext from '@/contexts/PlansContext';

import Alert from '../Alert';
import { Time } from '../Time';
import ReturnWindow from './ReturnWindow';

export default function OverlappingPlans({
  offer,
}: {
  offer: Pick<Offer, 'start' | 'end' | 'itinerary'>;
}) {
  const { plans } = use(PlansContext);
  const overlappedPlans = offer.itinerary
    .filter(({ overlap }) => overlap.contains(offer.start.time))
    .flatMap(
      item =>
        plans.find(
          b =>
            b.facilityId === item.facilityId &&
            !!b.start.time?.equals(item.startTime)
        ) ?? []
    );
  if (overlappedPlans.length === 0) return null;

  return (
    <Alert title="Overlapping Plans">
      <p>
        This return time overlaps with your existing plans more than is
        recommended:
      </p>
      <ul className="dividers divide-yellow-400/50 -my-3 px-4">
        {overlappedPlans.map(b => (
          <li key={b.id}>
            <div className="font-semibold">
              <ReturnWindow {...b} />
            </div>
            <div className="text-lg">{b.name}</div>
            {b.type === 'LL' && b.showTimeInfo && (
              <div className="">
                Show Time:{' '}
                <b>
                  <Time time={b.showTimeInfo.showStartTime} /> -{' '}
                  <Time time={b.showTimeInfo.showEndTime} />
                </b>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p>
        Consider selecting a different time so you don't miss out on any of your
        reservations.
      </p>
    </Alert>
  );
}
