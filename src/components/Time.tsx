import { formatTime } from '@/datetime';

export function Time({
  children: time,
  ...attrs
}: React.HTMLProps<HTMLTimeElement> & {
  children: string;
}) {
  try {
    const [hm, ampm] = formatTime(time).split(' ');
    return (
      <time
        {...attrs}
        dateTime={time.length <= 2 ? time.split(':')[0] + ':00' : time}
      >
        <span className="whitespace-nowrap">
          {hm} <span className="text-xs">{ampm}</span>
        </span>
      </time>
    );
  } catch (error) {
    console.error(error);
    return time;
  }
}
