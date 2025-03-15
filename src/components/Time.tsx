import { formatTime } from '@/datetime';

export function Time({
  children: time,
  ...attrs
}: React.HTMLProps<HTMLTimeElement> & {
  children: string;
}) {
  const [hm, ampm] = formatTime(time).split(' ');
  return (
    <time {...attrs} dateTime={time}>
      <span className="whitespace-nowrap">
        {hm} <span className="text-xs">{ampm}</span>
      </span>
    </time>
  );
}
