import { use } from 'react';

import { Time } from '@/components/Time';
import ThemeContext from '@/contexts/ThemeContext';
import { DateTime } from '@/datetime';

export default function TimeBanner({
  bookTime,
  dropTime,
}: {
  bookTime?: string;
  dropTime?: string;
}) {
  return bookTime || dropTime ? (
    <div className={`flex justify-center gap-x-10 ${use(ThemeContext).bg}`}>
      <LabeledTime label="Book" time={bookTime} />
      <LabeledTime label="Drop" time={dropTime} />
    </div>
  ) : null;
}

function LabeledTime({ label, time }: { label?: string; time?: string }) {
  if (!time) return null;
  time = time.slice(0, 5);
  const now = new DateTime().time.slice(0, 5);
  return (
    <div>
      {label}:{' '}
      {time > now ? <Time>{time}</Time> : <time dateTime={time}>now</time>}
    </div>
  );
}
