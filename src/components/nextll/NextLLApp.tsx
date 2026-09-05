import AutopilotProvider from '@/providers/AutopilotProvider';
import BookingDateProvider from '@/providers/BookingDateProvider';
import ExperiencesProvider from '@/providers/ExperiencesProvider';
import ParkProvider from '@/providers/ParkProvider';
import PlansProvider from '@/providers/PlansProvider';

import NextLL from './NextLL';

/**
 * Its own watch list, deliberately.
 *
 * Both bookmarklets run injected into Disney's origin and therefore share one
 * `localStorage`. NextLL replaces its single target every time it is used; if
 * it wrote to the same key, starting it would wipe the list Autopilot had been
 * carrying all day, and the loss would be silent.
 */
export const NEXTLL_WATCHLIST_KEY = 'bg1.nextll.watchlist';

/**
 * The provider stack NextLL needs, and no more.
 *
 * Merlock's stack additionally carries DAS parties, rebooking and navigation,
 * which exist for screens this build does not have. Autopilot sits below
 * Experiences because it consumes both experiences and plans.
 */
export default function NextLLApp() {
  return (
    <PlansProvider>
      <BookingDateProvider>
        <ParkProvider>
          <ExperiencesProvider>
            <AutopilotProvider watchListKey={NEXTLL_WATCHLIST_KEY}>
              <NextLL />
            </AutopilotProvider>
          </ExperiencesProvider>
        </ParkProvider>
      </BookingDateProvider>
    </PlansProvider>
  );
}
