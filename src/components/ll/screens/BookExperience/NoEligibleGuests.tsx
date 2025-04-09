import { use } from 'react';

import Alert from '@/components/Alert';
import { Time } from '@/components/Time';
import ClientsContext from '@/contexts/ClientsContext';
import RebookingContext from '@/contexts/RebookingContext';
import { DateTime } from '@/datetime';

import IneligibleGuestList from '../../IneligibleGuestList';

export default function NoEligibleGuests() {
  const { ll } = use(ClientsContext);
  const rebooking = use(RebookingContext);
  return (
    <>
      {rebooking.current ? (
        <>
          <h3>Unable to Modify</h3>
          <p>
            Your current reservation cannot be modified to this experience due
            to the following conflicts:
          </p>
        </>
      ) : (
        <>
          {ll.nextBookTime &&
            ll.nextBookTime.slice(0, 5) > DateTime.now().time.slice(0, 5) && (
              <Alert
                title={
                  <>
                    Eligible at <Time>{ll.nextBookTime}</Time>
                  </>
                }
              />
            )}
          <h3>No Eligible Guests</h3>
          <p>
            No one in your party is currently eligible for this Lightning Lane.
          </p>
        </>
      )}
      <IneligibleGuestList />
    </>
  );
}
