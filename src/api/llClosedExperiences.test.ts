import { respond, response } from '@/__fixtures__/client';
import {
  donald,
  hm,
  mickey,
  minnie,
  mk,
  pluto,
  sm,
  wdw,
} from '@/__fixtures__/ll';
import { TODAY, TOMORROW, setTime } from '@/testing';

import { LLClientWDW } from './ll/wdw';

/**
 * The closed-experience lookup, and specifically its failure behaviour.
 *
 * Lives in its own file because `src/api/ll.test.ts` is one of the suites
 * excluded from CI (see jest.ci.config.js) -- it is red in pristine upstream,
 * so a regression test added there would never gate anything. This covers the
 * one property that has already broken Autopilot in the park.
 */
const diu = {
  disneyInternalUse01: '1',
  disneyInternalUse02: '2',
  disneyInternalUse03: '3',
};
jest.mock('./diu', () => ({ __esModule: true, default: () => diu }));
jest.mock('@/ratelimit');

function apiGuest<T extends { name: string }>({ name, ...rest }: T) {
  const [firstName, lastName = ''] = name.split(' ');
  return { ...rest, firstName, lastName };
}

const guestsRes = response({
  guests: [mickey, minnie, pluto].map(apiGuest),
  ineligibleGuests: [donald].map(g =>
    apiGuest({
      ...g,
      ineligibleReason: { ineligibleReason: g.ineligibleReason },
    })
  ),
});

const tracker = { experienced: () => false, update: jest.fn() };

let client: LLClientWDW;

beforeEach(() => {
  jest.clearAllMocks();
  setTime('10:00');
  client = new LLClientWDW(wdw, tracker);
});

describe('LLClientWDW.experiences() when the closed-experience lookup fails', () => {
  // The tipboard has already come back. Throwing away a good result because an
  // extra request failed is bad on its own; it is worse than it looks because
  // usePoller reads a thrown tick as a failed one and backs off exponentially,
  // then stops after MAX_CONSECUTIVE_FAILURES. Restoring this lookup therefore
  // turned Autopilot on a future date into one checking every sixty seconds
  // and then not at all.
  it('still returns the tipboard experiences', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    // Order matters: the tipboard first, then the guests call the lookup
    // makes for its primary guest id, then the lookup itself.
    respond(response({ availableExperiences: [hm, sm] }), guestsRes);
    respond(response({}, 403));

    const exps = await client.experiences(mk, TOMORROW);
    expect(exps.map(e => e.id)).toEqual([hm.id, sm.id]);
  });

  it('does not pay for the same failure on every poll', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const tipboard = () => response({ availableExperiences: [hm, sm] });
    respond(tipboard(), guestsRes);
    respond(response({}, 403));
    await client.experiences(mk, TOMORROW);

    // Only the tipboard is queued for the second poll. If the lookup were
    // retried it would consume this response and the assertion below would
    // see the wrong shape -- or throw outright.
    respond(tipboard());
    const exps = await client.experiences(mk, TOMORROW);
    expect(exps.map(e => e.id)).toEqual([hm.id, sm.id]);
  });

  // A refusal from the bot filter is the case that prompted this, but the
  // reason must not matter: the poll has to survive any of them.
  it('survives a network failure just as well as a refusal', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    respond(response({ availableExperiences: [hm] }), guestsRes);
    const { fetchJson } = jest.requireMock('@/fetch') as {
      fetchJson: jest.Mock;
    };
    fetchJson.mockRejectedValueOnce(new Error('Network request failed'));

    await expect(client.experiences(mk, TOMORROW)).resolves.toHaveLength(1);
  });

  // Today with a populated tipboard never reaches the lookup at all, so a
  // broken endpoint costs nothing on the day that matters most.
  it('is not consulted for today when the tipboard has experiences', async () => {
    respond(response({ availableExperiences: [hm, sm] }));
    const exps = await client.experiences(mk, TODAY);
    expect(exps.map(e => e.id)).toEqual([hm.id, sm.id]);
  });
});

describe('LLClientWDW.experiences() when the lookup succeeds', () => {
  it('adds the attractions the tipboard omits as closed', async () => {
    respond(response({ availableExperiences: [hm] }), guestsRes);
    respond(response({ tiers: [{ experiences: [{ facilityId: sm.id }] }] }));

    const exps = await client.experiences(mk, TOMORROW);
    expect(exps.map(e => e.id)).toEqual([hm.id, sm.id]);
    expect(exps.find(e => e.id === sm.id)).toMatchObject({
      standby: { available: false, unavailableReason: 'CLOSED' },
      flex: { available: false },
    });
  });
});
