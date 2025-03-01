import { use } from 'react';

import Button from '@/components/Button';
import GuestList from '@/components/GuestList';
import Warning from '@/components/Warning';
import ClientsContext from '@/contexts/ClientsContext';
import NavContext from '@/contexts/NavContext';
import PartyContext from '@/contexts/PartyContext';

import IneligibleGuestList from '../../IneligibleGuestList';
import ModifyParty from '../ModifyParty';

export default function PartyList() {
  const { goTo } = use(NavContext);
  const party = use(PartyContext);
  const { eligible, selected } = party;
  const { maxPartySize } = use(ClientsContext).ll.rules;
  return (
    <>
      {eligible.length > maxPartySize && selected.length === maxPartySize && (
        <Warning title="Party Size Restricted">
          <p>
            Lightning Lane reservations are limited to 20 guests. If everyone in
            your party wishes to experience this attraction, you will need to
            book multiple reservations.
          </p>
        </Warning>
      )}
      {selected.length > 0 ? (
        <>
          <div className="mt-4">
            <h3 className="inline mt-0">Your Party</h3>
            <Button
              type="small"
              onClick={() => goTo(<ModifyParty party={party} />)}
              className="ml-3"
            >
              Modify
            </Button>
          </div>
          <GuestList guests={selected} />
        </>
      ) : (
        <>
          <h3>Ineligible Guests</h3>
          <IneligibleGuestList />
        </>
      )}
    </>
  );
}
