import { use } from 'react';

import GuestList from '@/components/GuestList';
import PartyContext from '@/contexts/PartyContext';
import { formatTime } from '@/datetime';

export default function IneligibleGuestList() {
  const { ineligible } = use(PartyContext);
  return (
    <GuestList
      guests={ineligible}
      conflicts={Object.fromEntries(
        ineligible.map(g => [
          g.id,
          g.eligibleAfter
            ? `TOO EARLY (${formatTime(g.eligibleAfter)})`
            : g.ineligibleReason || 'ELIGIBLE FOR NEW BOOKING',
        ])
      )}
    />
  );
}
