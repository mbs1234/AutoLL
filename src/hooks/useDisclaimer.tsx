import { useState } from 'react';

import Disclaimer from '@/components/screens/Disclaimer';
import kvdb from '@/kvdb';
import { key } from '@/storageKeys';

export const DISCLAIMER_ACCEPTED_KEY = key('disclaimer.accepted');

export default function useDisclaimer() {
  const [accepted, setAccepted] = useState(
    !!kvdb.get<number>(DISCLAIMER_ACCEPTED_KEY)
  );

  return accepted ? null : (
    <Disclaimer
      onAccept={() => {
        kvdb.set<number>(DISCLAIMER_ACCEPTED_KEY, 1);
        setAccepted(true);
      }}
    />
  );
}
