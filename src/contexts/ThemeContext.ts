import { createContext } from 'react';

import { Theme } from '@/api/resort';

export { Theme };

export const DEFAULT_THEME = {
  bg: `bg-bg1-blue`,
  text: 'text-bg1-blue-d',
  color: `var(--color-bg1-blue)`,
};

export default createContext<Theme>(DEFAULT_THEME);
