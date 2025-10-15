import { use } from 'react';

import { Queue } from '@/api/vq';
import Button from '@/components/Button';
import { Time } from '@/components/Time';
import NavContext from '@/contexts/NavContext';

import ChooseParty from './ChooseParty';

const isActive = (queue: Queue) =>
  queue.isAcceptingPartyCreation || queue.isAcceptingJoins;

export default function QueueListing({ queue }: { queue: Queue }) {
  const { goTo } = use(NavContext);

  return (
    <>
      <h2 className="mt-0">{queue.name}</h2>
      <div className="flex items-center mt-2">
        <div className="flex-1">
          {queue.isAcceptingJoins ? (
            <span>Available now</span>
          ) : queue.nextScheduledOpenTime ? (
            <>
              Next opening:{' '}
              <Time
                time={queue.nextScheduledOpenTime}
                className="font-semibold"
              />
            </>
          ) : (
            'Check Disney app for opening times'
          )}
        </div>
        <div className="pl-3">
          <Button
            disabled={!isActive(queue)}
            onClick={() => goTo(<ChooseParty queue={queue} />)}
          >
            {isActive(queue) ? 'Join Queue' : 'Closed'}
          </Button>
        </div>
      </div>
    </>
  );
}
