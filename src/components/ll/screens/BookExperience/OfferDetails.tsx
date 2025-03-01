import { use } from 'react';

import { Offer } from '@/api/ll';
import Button from '@/components/Button';
import ClientsContext from '@/contexts/ClientsContext';
import NavContext from '@/contexts/NavContext';

import ReturnTime from '../../ReturnTime';
import SelectReturnTime from '../SelectReturnTime';
import PartyList from './PartyList';

export default function OfferDetails({
  offer,
  onOfferChange,
}: {
  offer: Offer;
  onOfferChange: (offer: Offer) => void;
}) {
  const { goTo } = use(NavContext);
  const { ll } = use(ClientsContext);
  return (
    <>
      <div className="flex items-center">
        <ReturnTime
          {...offer}
          button={
            ll.rules.timeSelect && (
              <Button
                type="small"
                onClick={() =>
                  goTo(
                    <SelectReturnTime
                      offer={offer}
                      onOfferChange={onOfferChange}
                    />
                  )
                }
              >
                Change
              </Button>
            )
          }
        />
      </div>
      {offer.changed && (
        <div className="text-sm">
          <b>Note:</b> Return time has been changed
        </div>
      )}
      <PartyList />
    </>
  );
}
