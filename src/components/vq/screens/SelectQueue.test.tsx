import { mtwr, renderResort, rotr, santa, vq } from '@/__fixtures__/vq';
import { ReauthNeeded, authStore } from '@/api/auth';
import { click, loading, nav, revisitTab, screen, see } from '@/testing';

import SelectQueue from './SelectQueue';

jest.useFakeTimers();

describe('SelectQueue', () => {
  it('shows VQ selection screen', async () => {
    vq.getQueues.mockResolvedValueOnce([]);
    renderResort(
      <nav.Provider>
        <SelectQueue />
      </nav.Provider>
    );
    await loading();
    see('No virtual queues found');

    revisitTab(0);
    await loading();

    const queueNames = screen.getAllByRole('heading', { level: 2 });
    expect(queueNames[0]).toHaveTextContent(rotr.name);
    expect(queueNames[1]).toHaveTextContent(santa.name);
    expect(queueNames[2]).toHaveTextContent(mtwr.name);

    click('Refresh Queues');
    await loading();

    authStore.setData({
      swid: 'swid',
      accessToken: 'token',
      expires: Date.now() + 86400_000,
    });
    click('Log Out');
    expect(() => authStore.getData()).toThrow(ReauthNeeded);
  });
});
