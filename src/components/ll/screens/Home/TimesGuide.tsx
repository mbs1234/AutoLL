import { memo, use } from 'react';

import { Experience } from '@/api/ll';
import { Land } from '@/api/resort';
import Button from '@/components/Button';
import Screen from '@/components/Screen';
import Tab from '@/components/Tab';
import { Time } from '@/components/Time';
import DasPartiesContext from '@/contexts/DasPartiesContext';
import ExperiencesContext from '@/contexts/ExperiencesContext';
import NavContext from '@/contexts/NavContext';
import ThemeContext from '@/contexts/ThemeContext';

import DasPartyList from '../DasPartyList';
import { HomeTabProps } from '../Home';
import RefreshButton from '../RefreshButton';
import Legend, { Symbol } from './Legend';
import ParkSelect from './ParkSelect';

export default function TimesGuide({ ref }: HomeTabProps) {
  const { goTo } = use(NavContext);
  const { experiences, refreshExperiences, loaderElem } =
    use(ExperiencesContext);
  const parties = use(DasPartiesContext);

  return (
    <Tab
      title="Times Guide"
      buttons={
        <>
          {parties.length > 0 && (
            <Button
              title="Disability Access Service"
              onClick={() => goTo(<DasPartyList parties={parties} />)}
            >
              DAS
            </Button>
          )}
          <ParkSelect />
          <RefreshButton name="Times" onClick={refreshExperiences} />
        </>
      }
      ref={ref}
    >
      <Experiences experiences={experiences} />
      {loaderElem}
    </Tab>
  );
}

const Experiences = memo(function Experiences({
  experiences,
}: {
  experiences: Experience[];
}) {
  const { goTo } = use(NavContext);
  const showExpInfo = (exp: Experience) => goTo(<ExperienceInfo exp={exp} />);

  const expsByLand = new Map<Land, Record<Experience['type'], Experience[]>>();
  experiences
    .filter(
      exp =>
        exp.standby.available ||
        exp.standby.unavailableReason === 'TEMPORARILY_DOWN' ||
        exp.individual?.available ||
        exp.virtualQueue
    )
    .sort((a, b) => a.land.sort - b.land.sort || a.name.localeCompare(b.name))
    .forEach(exp => {
      if (!expsByLand.has(exp.land)) {
        expsByLand.set(exp.land, {
          A: [],
          E: [],
          C: [],
          H: [],
        });
      }
      expsByLand.get(exp.land)?.[exp.type]?.push(exp);
    });

  return (
    <>
      {[...expsByLand].map(([land, expsByType]) => (
        <div key={land.name}>
          <h2
            className={`pr-1 ${land.theme.text} text-sm font-semibold text-right uppercase`}
          >
            {land.name}
          </h2>
          <div className="rounded-sm overflow-hidden">
            <ExperienceList
              title="Attractions"
              land={land}
              experiences={expsByType.A}
              onInfoClick={showExpInfo}
            />
            <ExperienceList
              title="Entertainment"
              land={land}
              experiences={expsByType.E}
              onInfoClick={showExpInfo}
            />
            <ExperienceList
              title="Holiday Entertainment"
              land={land}
              experiences={expsByType.H}
              onInfoClick={showExpInfo}
            />
            <ExperienceList
              title="Characters"
              land={land}
              experiences={expsByType.C}
              onInfoClick={showExpInfo}
            />
          </div>
        </div>
      ))}
      {experiences.length > 0 && (
        <>
          <Legend>
            <Symbol sym="–" def="No posted wait/show time" />
            <Symbol sym="❌" def="Temporarily down" />
            <Symbol sym="VQ" def="Virtual queue" />
          </Legend>
          <p className="text-sm text-center">
            <span className={`${use(ThemeContext).text} font-bold`}>
              Popular attractions
            </span>{' '}
            are shown in bold
          </p>
        </>
      )}
    </>
  );
});

function ExperienceList({
  title,
  land,
  experiences,
  onInfoClick,
}: {
  title: string;
  land: Land;
  experiences: Experience[];
  onInfoClick: (experience: Experience) => void;
}) {
  if (experiences.length === 0) return null;
  return (
    <div className={`${land.theme.bg}`} data-testid={`${land.name}-${title}`}>
      <h3 className="mt-0 py-1 text-white text-xs font-semibold text-center uppercase">
        {title}
      </h3>
      <table className="w-full leading-snug">
        <tbody>
          {experiences.map(exp => (
            <tr className="group" key={exp.id}>
              <td
                className={`${
                  exp.showTimes ? 'min-w-[5.625rem]' : 'min-w-[2.75rem]'
                } px-2 py-0.5 group-first:pt-1 group-last:pb-1 bg-white/80 font-bold text-center uppercase whitespace-nowrap`}
              >
                {exp.showTimes?.[0] ? (
                  exp.showTimes.length > 1 ? (
                    <button
                      onClick={() => onInfoClick(exp)}
                      className="underline"
                    >
                      <Time>{exp.showTimes[0]}</Time>
                    </button>
                  ) : (
                    <Time>{exp.showTimes[0]}</Time>
                  )
                ) : exp.standby.available ? (
                  (exp.standby.waitTime ?? '–')
                ) : exp.virtualQueue &&
                  exp.standby.unavailableReason === 'NOT_STANDBY_ENABLED' ? (
                  'VQ'
                ) : (
                  '❌'
                )}
              </td>
              <td className="w-full px-1 pl-2 py-0.5 group-first:pt-1 group-last:pb-1 bg-white/90">
                <div className="flex items-center gap-x-2">
                  <div
                    className={`flex-1 ${
                      exp.highlight ? `font-bold ${land.theme.text}` : ''
                    }`}
                  >
                    {exp.name}
                  </div>
                  {exp?.individual && (
                    <div
                      className={`${land.theme.text} text-xs leading-tight font-semibold text-center uppercase`}
                    >
                      <div>
                        <abbr title="Lightning Lane">LL</abbr>
                        {': ' + exp.individual.displayPrice}
                      </div>
                      {exp.individual.nextAvailableTime && (
                        <div>
                          <Time>{exp.individual.nextAvailableTime}</Time>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ExperienceInfo = ({ exp }: { exp: Experience }) => (
  <Screen title="Experience Info">
    <h2>{exp.name}</h2>
    <div>{exp.park.name}</div>
    <h3>Upcoming {exp.type === 'C' ? 'Appearances' : 'Shows'}</h3>
    <ul className="list-disc mt-2 pl-6">
      {exp.showTimes?.map(time => (
        <li key={time}>
          <Time>{time}</Time>
        </li>
      ))}
    </ul>
  </Screen>
);
