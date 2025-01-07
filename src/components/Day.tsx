import { DisplayType, displayDate } from '@/datetime';

export function Day({
  children: date,
  type,
  ...attrs
}: React.HTMLProps<HTMLTimeElement> & {
  children: string;
  type?: DisplayType;
}) {
  return (
    <time {...attrs} dateTime={date}>
      {displayDate(date, type)}
    </time>
  );
}
