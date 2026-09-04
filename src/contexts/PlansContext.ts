import { createContext } from 'react';

import { Booking } from '@/api/itinerary';
import useDataLoader from '@/hooks/useDataLoader';
import useThrottleable from '@/hooks/useThrottleable';

interface PlansState {
  plans: Booking[];
  refreshPlans: ReturnType<typeof useThrottleable>;
  /**
   * Silent, awaitable refresh, for background polling. See the note on
   * `pollExperiences` in ExperiencesContext for why `refreshPlans` cannot
   * serve this purpose.
   */
  pollPlans: () => Promise<void>;
  loaderElem: ReturnType<typeof useDataLoader>['loaderElem'];
  plansLoaded?: boolean;
}

export default createContext<PlansState>({
  plans: [],
  refreshPlans: () => undefined,
  pollPlans: () => Promise.resolve(),
  loaderElem: null,
});
