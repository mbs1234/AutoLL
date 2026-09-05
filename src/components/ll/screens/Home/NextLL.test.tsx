import { fireEvent, render, screen } from '@testing-library/react';

import { mk, wdw } from '@/__fixtures__/resort';
import { Booking } from '@/api/itinerary';
import { Experience } from '@/api/ll';
import { PollerStatus } from '@/autopilot/usePoller';
import AutopilotContext, { AutopilotState } from '@/contexts/AutopilotContext';
import BookingDateContext from '@/contexts/BookingDateContext';
import ClientsContext, { Clients } from '@/contexts/ClientsContext';
import ExperiencesContext from '@/contexts/ExperiencesContext';
import ParkContext from '@/contexts/ParkContext';
import PlansContext from '@/contexts/PlansContext';
import { DateTime, ParkTime } from '@/datetime';
import { TODAY } from '@/testing';

import { NextLL } from './NextLL';

const BZ = '80010114';
const OFF: PollerStatus = { mode: 'off', consecutiveFailures: 0, polls: 0 };
const RUNNING: PollerStatus = {
  mode: 'idle',
  consecutiveFailures: 0,
  polls: 7,
};

function llExperience(id: string): Experience {
  return {
    ...wdw.experience(id),
    park: mk,
    standby: { available: true, waitTime: 30 },
    flex: { available: true, nextAvailableTime: new ParkTime(11) },
  } as Experience;
}

/** A held Multi Pass for BZ at the given hour. */
function heldAt(hour: number): Booking {
  return {
    type: 'LL',
    subtype: 'MP',
    id: 'ent-1',
    facilityId: BZ,
    name: 'Held',
    start: new DateTime(TODAY, new ParkTime(hour)),
    end: new DateTime(TODAY, new ParkTime(hour + 1)),
    cancellable: true,
    modifiable: true,
    guests: [{ id: 'g1', name: 'A' }],
  } as unknown as Booking;
}

function setup({
  status = OFF,
  enabled = false,
  plans = [] as Booking[],
  ...rest
}: Partial<AutopilotState> & { plans?: Booking[] } = {}) {
  const setEnabled = jest.fn();
  const addTarget = jest.fn();
  const removeTarget = jest.fn();
  const setPartyIds = jest.fn();
  render(
    <ClientsContext value={{ ll: { setPartyIds } } as unknown as Clients}>
      <ParkContext value={{ park: mk, setPark: () => {} }}>
        <BookingDateContext
          value={{ bookingDate: TODAY, setBookingDate: () => {} }}
        >
          <PlansContext
            value={{
              plans,
              plansLoaded: true,
              refreshPlans: () => {},
              pollPlans: async () => plans,
              loaderElem: null,
            }}
          >
            <ExperiencesContext
              value={{
                experiences: [llExperience(BZ)],
                refreshExperiences: () => {},
                pollExperiences: async () => [],
                loaderElem: null,
              }}
            >
              <AutopilotContext
                value={
                  {
                    enabled,
                    setEnabled,
                    status,
                    targets: [],
                    isWatched: () => false,
                    addTarget,
                    removeTarget,
                    bookingLog: [],
                    bookedCount: 0,
                    bookingsRemaining: 10,
                    ...rest,
                  } as unknown as AutopilotState
                }
              >
                <NextLL />
              </AutopilotContext>
            </ExperiencesContext>
          </PlansContext>
        </BookingDateContext>
      </ParkContext>
    </ClientsContext>
  );
  return { setEnabled, addTarget, removeTarget, setPartyIds };
}

const name = wdw.experience(BZ).name;

describe('NextLL', () => {
  // The whole point of the screen: one attraction, one goal, one button. If
  // this grows a second decision it has stopped being NextLL.
  it('asks for an attraction and nothing else that is required', () => {
    setup();
    expect(screen.getByText('Find it')).toBeVisible();
    expect(screen.getByLabelText('Latest acceptable return time')).toHaveValue(
      ''
    );
  });

  it('does nothing without an attraction chosen', () => {
    const { setEnabled, addTarget } = setup();
    screen.getByText('Find it').click();
    expect(addTarget).not.toHaveBeenCalled();
    expect(setEnabled).not.toHaveBeenCalled();
  });

  // `bookThenMove` is this problem already solved: take any time so something
  // is held, then treat the window as the goal to move toward.
  it('arms a single book-then-move target with no bound by default', () => {
    const { setEnabled, addTarget } = setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: BZ } });
    screen.getByText('Find it').click();
    expect(addTarget).toHaveBeenCalledWith({
      experienceId: BZ,
      bookThenMove: true,
    });
    expect(setEnabled).toHaveBeenCalledWith(true);
  });

  it('passes a return-by time through as the upper bound', () => {
    const { addTarget } = setup();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: BZ } });
    fireEvent.change(screen.getByLabelText('Latest acceptable return time'), {
      target: { value: '13:00' },
    });
    screen.getByText('Find it').click();
    expect(addTarget).toHaveBeenCalledWith({
      experienceId: BZ,
      bookThenMove: true,
      before: new ParkTime(13),
    });
  });

  it('reports that nothing is held yet while it searches', () => {
    setup({ enabled: true, status: RUNNING, targets: [{ experienceId: BZ }] });
    expect(screen.getByText(/Nothing held yet/)).toBeVisible();
    expect(screen.getByText(name)).toBeVisible();
  });

  it('shows what it is holding, and that it is still improving on it', () => {
    setup({
      enabled: true,
      status: RUNNING,
      plans: [heldAt(15)],
      targets: [{ experienceId: BZ, before: new ParkTime(13) }],
    });
    expect(
      screen.getByText(/still looking for something earlier/)
    ).toBeVisible();
  });

  // The goal being met is the one moment the screen should feel finished.
  it('says the goal is met once the held time is inside the bound', () => {
    setup({
      enabled: true,
      status: RUNNING,
      plans: [heldAt(11)],
      targets: [{ experienceId: BZ, before: new ParkTime(13) }],
    });
    expect(screen.getByText(/that will do/)).toBeVisible();
    expect(screen.getByText('Done')).toBeVisible();
  });

  it('stops and clears its target', () => {
    const { setEnabled, removeTarget } = setup({
      enabled: true,
      status: RUNNING,
      targets: [{ experienceId: BZ }],
    });
    screen.getByText('Stop looking').click();
    expect(setEnabled).toHaveBeenCalledWith(false);
    expect(removeTarget).toHaveBeenCalledWith(BZ);
  });
});
