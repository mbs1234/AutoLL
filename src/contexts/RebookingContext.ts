import { createContext } from 'react';

import { LLMP } from '@/api/itinerary';

export interface Rebooking {
  current: LLMP | undefined;
  auto: boolean;
  begin: (booking: LLMP, auto?: boolean) => void;
  end: () => void;
}

export default createContext<Rebooking>({
  current: undefined,
  auto: false,
  begin: () => undefined,
  end: () => undefined,
});
