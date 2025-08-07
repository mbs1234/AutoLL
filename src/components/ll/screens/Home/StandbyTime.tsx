import { Experience } from '@/api/ll';
import { Time } from '@/components/Time';

import LabeledItem from './LabeledItem';

export default function StandbyTime({
  experience: { standby, showTimes, virtualQueue, avgWait },
  average,
}: {
  experience: Pick<
    Experience,
    'standby' | 'showTimes' | 'virtualQueue' | 'avgWait'
  >;
  average?: boolean;
}) {
  return average ? (
    <AverageWait time={avgWait} virtualQueue={virtualQueue} />
  ) : showTimes ? (
    <NextShowTime showTimes={showTimes} />
  ) : virtualQueue ? (
    <VQStatus virtualQueue={virtualQueue} />
  ) : (
    <WaitTime standby={standby} />
  );
}

function Minutes({
  children: m,
  rounded,
}: {
  children: number;
  rounded?: boolean;
}) {
  if (rounded) m = Math.round(m / 5) * 5;
  return (
    <time dateTime={`PT${m}M`}>
      {m} <span className="text-sm">min</span>
    </time>
  );
}

function AverageWait({
  time,
  virtualQueue,
}: {
  time?: number;
  virtualQueue?: Experience['virtualQueue'];
}) {
  return (
    <LabeledItem label="Standby">
      <Available
        time={
          time !== undefined ? (
            <Minutes rounded>{time}</Minutes>
          ) : virtualQueue ? (
            <abbr title="Virtual queue">VQ</abbr>
          ) : (
            <abbr title="Not applicable" className="px-1">
              –
            </abbr>
          )
        }
      />
    </LabeledItem>
  );
}

const WaitTime = ({ standby }: Pick<Experience, 'standby'>) => (
  <LabeledItem label="Standby">
    {standby.available ? (
      <Available
        time={
          standby.waitTime !== undefined ? (
            <Minutes>{standby.waitTime}</Minutes>
          ) : (
            'now'
          )
        }
      />
    ) : (
      <Unavailable text="down" />
    )}
  </LabeledItem>
);

const NextShowTime = ({
  showTimes,
}: Required<Pick<Experience, 'showTimes'>>) => (
  <LabeledItem
    label={
      <>
        Next <span className="hidden xs:inline">Show</span>
      </>
    }
  >
    {showTimes[0] ? (
      <Available time={<Time time={showTimes[0]} />} />
    ) : (
      <Unavailable text="none" />
    )}
  </LabeledItem>
);

const VQStatus = ({
  virtualQueue,
}: Required<Pick<Experience, 'virtualQueue'>>) => (
  <LabeledItem label={<abbr title="Virtual Queue">VQ</abbr>}>
    <Available
      time={
        virtualQueue.nextAvailableTime ? (
          <Time time={virtualQueue.nextAvailableTime} />
        ) : (
          'closed'
        )
      }
    />
  </LabeledItem>
);

const className =
  'inline-block border-2 rounded-sm px-1.5 py-0.5 font-semibold';

const Available = ({ time }: { time: React.ReactNode }) => (
  <span className={`${className} border-gray-500 text-gray-500 bg-gray-100`}>
    {time}
  </span>
);

const Unavailable = ({ text }: { text: React.ReactNode }) => (
  <span className={`${className} border-red-600 text-red-600 bg-red-100`}>
    {text}
  </span>
);
