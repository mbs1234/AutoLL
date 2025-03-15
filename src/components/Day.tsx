import { DateFormatType, formatDate } from '@/datetime';

export function Day({
  children: date,
  type,
  ...attrs
}: React.HTMLProps<HTMLTimeElement> & {
  children: string;
  type?: DateFormatType;
}) {
  return (
    <time {...attrs} dateTime={date}>
      {formatDate(date, type)}
    </time>
  );
}
