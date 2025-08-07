import { use } from 'react';

import { Time } from '@/components/Time';
import ThemeContext from '@/contexts/ThemeContext';
import { DateTime, ParkTime } from '@/datetime';

export default function TimeBanner({
  bookTime,
  dropTime,
}: {
  bookTime?: ParkTime;
  dropTime?: ParkTime;
}) {
  return bookTime || dropTime ? (
    <div className={`flex justify-center gap-x-10 ${use(ThemeContext).bg}`}>
      <LabeledTime label="Book" time={bookTime} />
      <LabeledTime label="Drop" time={dropTime} />
    </div>
  ) : null;
}

function LabeledTime({ label, time }: { label?: string; time?: ParkTime }) {
  if (!time) return null;
  const now = DateTime.now().time.with({ second: 0 });
  return (
    <div>
      {label}:{' '}
      {time > now ? (
        <Time time={time} />
      ) : (
        <time dateTime={`${time}`}>now</time>
      )}
    </div>
  );
}
