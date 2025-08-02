import { use } from 'react';

import ThemeContext from '@/contexts/ThemeContext';
import RefreshIcon from '@/icons/RefreshIcon';

import Overlay from './Overlay';

export default function Spinner() {
  const { bg } = use(ThemeContext);
  return (
    <Overlay color="bg-white/75">
      <div className="w-12 mx-auto">
        <div aria-label="Loading…" className={`rounded-full p-[20%] ${bg}`}>
          <RefreshIcon className="animate-spin w-full text-white" />
        </div>
      </div>
    </Overlay>
  );
}
