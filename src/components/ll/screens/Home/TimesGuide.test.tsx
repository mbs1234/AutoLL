import { party } from '@/__fixtures__/das';
import { mk, renderResort, wdw } from '@/__fixtures__/ll';
import { DasParty } from '@/api/das';
import { Experience } from '@/api/ll';
import { Experience as ExpData, ExperienceType } from '@/api/resort';
import DasPartiesContext from '@/contexts/DasPartiesContext';
import ExperiencesContext from '@/contexts/ExperiencesContext';
import ParkContext from '@/contexts/ParkContext';
import { ParkTime, formatTime } from '@/datetime';
import NavProvider from '@/providers/NavProvider';
import { click, screen, see, within } from '@/testing';

import TimesGuide from './TimesGuide';

function expectTimes(def: { [key: string]: { [key: string]: Experience[] } }) {
  for (const [land, subdef] of Object.entries(def)) {
    see(land, 'heading');
    for (const [expType, exps] of Object.entries(subdef)) {
      const c = within(screen.getByTestId(`${land}-${expType}`));
      c.getByRole('heading', { name: expType });
      expect(c.getAllByRole('cell').map(elem => elem.textContent)).toEqual(
        exps.flatMap(exp => [
          String(
            exp.standby.waitTime ??
              (exp.showTimes
                ? formatTime(exp.showTimes[0])
                : exp.standby.available
                  ? '–'
                  : '❌')
          ),
          exp.name +
            (exp.individual?.available
              ? 'LL: ' + exp.individual.displayPrice
              : ''),
        ])
      );
    }
  }
}

function exp(
  id: string,
  args: {
    type?: ExperienceType;
    waitTime?: number;
    showTimes?: ParkTime[];
    down?: true;
    individual?: {
      available?: boolean;
    };
  } = {}
): Experience {
  return {
    ...(wdw.experience(id) as ExpData),
    id,
    park: mk,
    standby: {
      available: !args.down,
      waitTime: args.waitTime,
      unavailableReason: args.down && 'TEMPORARILY_DOWN',
    },
    showTimes: args.showTimes,
    individual: args.individual
      ? { available: true, displayPrice: '$12', ...args.individual }
      : undefined,
  };
}

const ddShowTimes = ['14:30', '15:30'].map(ParkTime.from);
const dd = exp('8075', {
  showTimes: ddShowTimes,
});
const fofShowTimes = ['15:00'].map(ParkTime.from);
const fof = exp('17718925', {
  showTimes: fofShowTimes,
});
const potc = exp('80010177', { waitTime: 30 });
const tiki = exp('16124144');
const btmr = exp('80010110', { waitTime: 60 });
const sdmt = exp('16767284', { waitTime: 85, individual: {} });
const uts = exp('16767263', { down: true });
const tiana = exp('17505397', { waitTime: 45 });
const refreshExperiences = jest.fn();

function renderComponent({
  experiences = [sdmt, dd, fof, potc, tiki, btmr, tiana, uts],
  dasParties = [],
}: { experiences?: Experience[]; dasParties?: DasParty[] } = {}) {
  renderResort(
    <ParkContext value={{ park: mk, setPark: () => null }}>
      <DasPartiesContext value={dasParties}>
        <ExperiencesContext
          value={{
            experiences,
            refreshExperiences,
            pollExperiences: async () => {},
            loaderElem: null,
          }}
        >
          <NavProvider>
            <TimesGuide ref={{ current: null }} />
          </NavProvider>
        </ExperiencesContext>
      </DasPartiesContext>
    </ParkContext>
  );
}

describe('TimesGuide', () => {
  it('renders times guide', async () => {
    renderComponent();
    see.no('DAS');

    click('Refresh Times');
    expect(refreshExperiences).toHaveBeenCalledTimes(1);

    expectTimes({
      'Main Street, USA': {
        Entertainment: [dd, fof],
      },
      Adventureland: {
        Attractions: [tiki, potc],
      },
      Frontierland: {
        Attractions: [btmr],
      },
      Fantasyland: {
        Attractions: [sdmt, uts],
        Characters: [tiana],
      },
    });

    click(see.time(fofShowTimes[0]));
    expect(
      screen.queryByRole('heading', { name: fof.name, level: 2 })
    ).not.toBeInTheDocument();

    click(formatTime(ddShowTimes[0]));
    await see.screen('Experience Info');
    see(dd.name, 'heading', { level: 2 });

    see('Upcoming Shows');
    expect(
      screen.getAllByRole('listitem').map(elem => elem.textContent)
    ).toEqual(ddShowTimes.map(formatTime));
  });

  it("doesn't show ILL after park close", async () => {
    renderComponent({
      experiences: [
        {
          ...sdmt,
          standby: {
            available: false,
            unavailableReason: 'NOT_STANDBY_ENABLED',
          },
          individual: { available: false, displayPrice: '$12' },
        },
      ],
    });
    see.no(sdmt.name);
  });

  it('always shows VQs', async () => {
    renderComponent({
      experiences: [
        {
          ...potc,
          standby: { available: false },
          virtualQueue: { available: false },
        },
      ],
    });
    see(potc.name);
  });

  it('shows DAS button if eligible', async () => {
    renderComponent({ dasParties: [party] });
    see('DAS', 'button');
  });
});
