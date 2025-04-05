import { use } from 'react';

import TabsContext, { TabDef } from '@/contexts/TabContext';
import ThemeContext from '@/contexts/ThemeContext';

export default function TabButton<N extends string>({ name, icon }: TabDef<N>) {
  const { active, changeTab } = use(TabsContext);
  if (!changeTab) return null;
  const theme = use(ThemeContext);
  const isActive = active?.name === name;
  const iconStyles = isActive
    ? `bg-white/90 ${theme.text}`
    : `${theme.bg} text-white`;
  return (
    <button className={`px-4 py-2`} onClick={() => changeTab(name)}>
      <div className={`min-w-[3rem] rounded-full py-1.5 ${iconStyles}`}>
        {icon}
      </div>
      <div className="mt-0.5 text-sm">{name}</div>
    </button>
  );
}
