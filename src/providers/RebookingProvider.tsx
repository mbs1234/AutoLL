import { useState } from 'react';

import { LLMP } from '@/api/itinerary';
import RebookingContext, { Rebooking } from '@/contexts/RebookingContext';

export default function RebookingProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value?: Rebooking;
}) {
  const [rebooking, setRebooking] = useState<Rebooking>(() => ({
    current: undefined,
    auto: false,
    begin: (booking: LLMP, auto = false) => {
      setRebooking(rb =>
        booking === rb.current ? rb : { ...rb, current: booking, auto }
      );
    },
    end: () => {
      setRebooking(rb =>
        rb.current ? { ...rb, current: undefined, auto: false } : rb
      );
    },
  }));

  return (
    <RebookingContext value={value ?? rebooking}>{children}</RebookingContext>
  );
}
