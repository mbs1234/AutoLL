import {
  fifi,
  mickey,
  minnie,
  pluto,
  renderResort,
  rotr,
} from '@/__fixtures__/vq';
import { click, loading, nav, see } from '@/testing';

import ChooseParty from './ChooseParty';
import JoinQueue from './JoinQueue';

jest.useFakeTimers();
const { Provider: NavProvider, goTo } = nav;

describe('ChooseParty', () => {
  it('shows VQ party selection screen', async () => {
    renderResort(
      <NavProvider>
        <ChooseParty queue={rotr} />
      </NavProvider>
    );
    await loading();

    click(pluto.name);
    click(fifi.name);
    see('Selection limit reached');

    click(minnie.name);
    click('Confirm Party');
    expect(goTo).toHaveBeenLastCalledWith(
      <JoinQueue queue={rotr} guests={[mickey, pluto]} />
    );
  });
});
