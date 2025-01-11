import { render, see } from '@/testing';

import StandbyTime from './StandbyTime';

describe('StandbyTime', () => {
  it('shows wait time', () => {
    render(
      <StandbyTime
        experience={{
          type: 'ATTRACTION',
          standby: { available: true, waitTime: 45 },
        }}
      />
    );
    see.time('45 min');
  });

  it('shows no wait', () => {
    render(
      <StandbyTime
        experience={{ type: 'ATTRACTION', standby: { available: true } }}
      />
    );
    see('now');
  });

  it('shows ride down', () => {
    render(
      <StandbyTime
        experience={{ type: 'ATTRACTION', standby: { available: false } }}
      />
    );
    see('down');
  });

  it('shows next show time', () => {
    const nextShowTime = '15:00:00';
    render(
      <StandbyTime
        experience={{
          type: 'ENTERTAINMENT',
          standby: { available: true, nextShowTime },
        }}
      />
    );
    see.time(nextShowTime);
  });

  it('shows no next show', () => {
    render(
      <StandbyTime
        experience={{
          type: 'ENTERTAINMENT',
          standby: { available: false },
        }}
      />
    );
    see('none');
  });

  it('shows next VQ open time', () => {
    const nextAvailableTime = '07:00:00';
    render(
      <StandbyTime
        experience={{
          type: 'ATTRACTION',
          standby: { available: true },
          virtualQueue: {
            available: true,
            nextAvailableTime,
          },
        }}
      />
    );
    see('VQ');
    see.time(nextAvailableTime);
  });

  it('shows closed VQ', () => {
    render(
      <StandbyTime
        experience={{
          type: 'ATTRACTION',
          standby: { available: true },
          virtualQueue: { available: true },
        }}
      />
    );
    see('VQ');
    see('closed');
  });
});
