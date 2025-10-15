import { mtwr, renderResort, rotr, santa, vq } from '@/__fixtures__/vq';
import {
  click,
  loading,
  nav,
  revisitTab,
  screen,
  see,
  within,
} from '@/testing';

import ChooseParty from './ChooseParty';
import SelectQueue from './SelectQueue';

jest.useFakeTimers();
const { Provider: NavProvider, goTo } = nav;

describe('SelectQueue', () => {
  it('shows VQ selection screen', async () => {
    vq.getQueues.mockResolvedValueOnce([]);
    renderResort(
      <NavProvider>
        <SelectQueue />
      </NavProvider>
    );
    await loading();
    see('No virtual queues found');

    revisitTab(0);
    await loading();
    const lis = screen.getAllByRole('listitem') as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    within(lis[0]).getByText(rotr.name);
    expect(lis[0]).toHaveTextContent('Next opening: 7:00 AM');
    expect(within(lis[0]).getByText('Join Queue')).toBeEnabled();
    within(lis[1]).getByText(santa.name);
    expect(lis[1]).toHaveTextContent('Available now');
    expect(within(lis[1]).getByText('Join Queue')).toBeEnabled();
    within(lis[2]).getByText(mtwr.name);
    expect(lis[2]).toHaveTextContent('Check Disney app for opening times');
    expect(within(lis[2]).getByText('Closed')).toBeDisabled();

    click(screen.getAllByText('Join Queue')[0]!);
    expect(goTo).toHaveBeenLastCalledWith(<ChooseParty queue={rotr} />);

    vq.getQueues.mockResolvedValueOnce([
      { ...rotr, isAcceptingJoins: false, isAcceptingPartyCreation: false },
    ]);

    click('Refresh Queues');
    await loading();
  });
});
