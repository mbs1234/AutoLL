import { use, useCallback, useEffect, useState } from 'react';

import { Booking } from '@/api/itinerary';
import ClientsContext from '@/contexts/ClientsContext';
import PlansContext from '@/contexts/PlansContext';
import useDataLoader from '@/hooks/useDataLoader';
import useThrottleable from '@/hooks/useThrottleable';

export default function PlansProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { itinerary } = use(ClientsContext);
  const { loadData, loaderElem } = useDataLoader();
  const [plans, setPlans] = useState<Booking[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);

  /**
   * The actual fetch, awaitable and free of UI side effects. Rejects on
   * failure so background callers can back off; `refreshPlans` wraps it in
   * `loadData` for the visible path.
   */
  const fetchPlans = useCallback(async () => {
    setPlans(await itinerary.plans());
    setPlansLoaded(true);
  }, [itinerary]);

  const refreshPlans = useThrottleable(
    useCallback(() => {
      loadData(fetchPlans);
    }, [fetchPlans, loadData])
  );

  useEffect(refreshPlans, [refreshPlans]);

  return (
    <PlansContext
      value={{
        plans,
        plansLoaded,
        refreshPlans,
        pollPlans: fetchPlans,
        loaderElem,
      }}
    >
      {children}
    </PlansContext>
  );
}
