import { createContext } from 'react';

import { Guest, Guests } from '@/api/ll';

import { Theme } from './ThemeContext';

export interface Party extends Guests {
  selected: Guest[];
  setSelected: (guests: Guest[]) => void;
  experience: {
    name: string;
    park: { name: string; theme: Theme };
  };
}

export default createContext<Party>({
  eligible: [],
  ineligible: [],
  selected: [],
  setSelected: () => null,
  experience: {
    name: '',
    park: { name: '', theme: { bg: '', text: '', color: '' } },
  },
});
