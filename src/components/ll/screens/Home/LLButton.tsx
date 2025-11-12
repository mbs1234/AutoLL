import { use } from 'react';

import { FlexExperience } from '@/api/ll';
import Button from '@/components/Button';
import { Time } from '@/components/Time';
import NavContext from '@/contexts/NavContext';

import BookExperience from '../BookExperience';

export default function LLButton({
  experience,
}: {
  experience: FlexExperience;
}) {
  const { goTo } = use(NavContext);
  const { flex, standby } = experience;

  return (
    <Button onClick={() => goTo(<BookExperience experience={experience} />)}>
      {standby.unavailableReason === 'CLOSED' ? (
        'Book'
      ) : flex.nextAvailableTime ? (
        <Time time={flex.nextAvailableTime} />
      ) : (
        'none'
      )}
    </Button>
  );
}
