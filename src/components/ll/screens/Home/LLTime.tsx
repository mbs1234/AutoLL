import { FlexExperience } from '@/api/ll';
import { Time } from '@/components/Time';

import { Available, Unavailable } from './StandbyTime';

export default function LLTime({ experience }: { experience: FlexExperience }) {
  const { flex, standby } = experience;

  return standby.unavailableReason === 'CLOSED' ? (
    <Available time="unknown" />
  ) : flex.nextAvailableTime ? (
    <Available time={<Time time={flex.nextAvailableTime} />} />
  ) : (
    <Unavailable text="none" />
  );
}
