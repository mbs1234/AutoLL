import { DateFormatType, formatDate } from '@/datetime';

export function Day({
  children: date,
  type,
  ...attrs
}: React.HTMLProps<HTMLTimeElement> & {
  children: string;
  type?: DateFormatType;
}) {
  try {
    return (
      <time {...attrs} dateTime={date}>
        {formatDate(date, type)}
      </time>
    );
  } catch (error) {
    console.error(error);
    return date;
  }
}
