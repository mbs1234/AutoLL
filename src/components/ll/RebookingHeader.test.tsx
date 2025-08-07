import { booking } from '@/__fixtures__/ll';
import RebookingContext from '@/contexts/RebookingContext';
import { click, nav, render, see, setTime, waitFor } from '@/testing';

import RebookingHeader, { Back } from './RebookingHeader';
import Home from './screens/Home';

setTime('10:00');

const rebooking = {
  begin: () => null,
  end: jest.fn(),
  auto: false,
  current: booking as typeof booking | undefined,
};

function Test<P>({ back }: { back?: Back<P> }) {
  return (
    <RebookingContext value={{ ...rebooking }}>
      <nav.Provider>
        <RebookingHeader back={back} />
      </nav.Provider>
    </RebookingContext>
  );
}

describe('RebookingHeader', () => {
  beforeEach(() => {
    rebooking.current = booking;
  });

  it('shows LL to be modified', async () => {
    render(<Test />);
    see(booking.name);
    see.time(booking.start.time);
    see.time(booking.end.time);
    click('Keep');
    expect(rebooking.end).toHaveBeenCalledTimes(1);
    expect(nav.goBack).not.toHaveBeenCalled();
  });

  it('shows nothing if not modifying', async () => {
    rebooking.current = undefined;
    const { container } = render(<Test />);
    expect(container).toBeEmptyDOMElement();
  });

  it('goes back to specified screen when Keep clicked', async () => {
    render(<Test back={{ screen: Home }} />);
    click('Keep');
    await waitFor(() => expect(nav.goBack).toHaveBeenCalledTimes(1));
    expect(nav.goBack).toHaveBeenLastCalledWith({ screen: Home });
  });
});
