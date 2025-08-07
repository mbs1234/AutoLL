import { ParkTime } from '@/datetime';
import { render, see } from '@/testing';

import StandbyTime from './StandbyTime';

describe('StandbyTime', () => {
  it('shows wait time', () => {
    render(
      <StandbyTime
        experience={{
          standby: { available: true, waitTime: 45 },
        }}
      />
    );
    see.time('45 min');
  });

  it('shows no wait', () => {
    render(<StandbyTime experience={{ standby: { available: true } }} />);
    see('now');
  });

  it('shows ride down', () => {
    render(<StandbyTime experience={{ standby: { available: false } }} />);
    see('down');
  });

  it('shows next show time', () => {
    const nextShowTime = new ParkTime(15);
    render(
      <StandbyTime
        experience={{ standby: { available: true }, showTimes: [nextShowTime] }}
      />
    );
    see.time(nextShowTime);
  });

  it('shows no next show', () => {
    render(<StandbyTime experience={{ standby: {}, showTimes: [] }} />);
    see('none');
  });

  it('shows next VQ open time', () => {
    const nextAvailableTime = new ParkTime(7);
    render(
      <StandbyTime
        experience={{
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
          standby: { available: true },
          virtualQueue: { available: true },
        }}
      />
    );
    see('VQ');
    see('closed');
  });
});
