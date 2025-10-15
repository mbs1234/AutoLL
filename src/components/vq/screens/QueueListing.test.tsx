import { rotr } from '@/__fixtures__/vq';
import { Queue } from '@/api/vq';
import { click, nav, render, see } from '@/testing';

import ChooseParty from './ChooseParty';
import QueueListing from './QueueListing';

jest.useFakeTimers();

function renderQueue(queue: Queue) {
  render(
    <nav.Provider>
      <QueueListing queue={queue} />
    </nav.Provider>
  );
}

describe('QueueListing', () => {
  it('shows next opening time', () => {
    renderQueue(rotr);
    see(rotr.name);
    see('Next opening:');
    see.time('07:00:00');
    expect(see('Join Queue')).toBeEnabled();
    click('Join Queue');
    expect(nav.goTo).toHaveBeenLastCalledWith(<ChooseParty queue={rotr} />);
  });

  it('says "Available now" if accepting joins', () => {
    renderQueue({ ...rotr, isAcceptingJoins: true });
    see('Available now');
    expect(see('Join Queue')).toBeEnabled();
  });

  it('refer to Disney app as fallback', () => {
    renderQueue({
      ...rotr,
      isAcceptingPartyCreation: false,
      nextScheduledOpenTime: null,
    });
    see('Check Disney app for opening times');
    expect(see('Closed')).toBeDisabled();
  });
});
