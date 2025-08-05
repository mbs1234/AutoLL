import { use, useCallback, useRef } from 'react';

import NavContext from '@/contexts/NavContext';
import TabsContext, { TabDef } from '@/contexts/TabContext';

export default function withTabs<N extends string>(
  { tabs, footer }: { tabs: TabDef<N>[]; footer: React.ReactNode },
  Component: React.FC<{ tab: TabDef<N> }>
) {
  return function Tabbed({ tabName }: { tabName: N }) {
    const { goTo } = use(NavContext);
    const changeTab = useCallback(
      (name: N) => {
        if (name !== tabName) {
          goTo(<Tabbed tabName={name} />, { replace: true });
        }
      },
      [tabName, goTo]
    );
    const scrollPos = useRef(Object.fromEntries(tabs.map(t => [t.name, 0])));
    const active = tabs.find(({ name }) => name === tabName) ?? tabs[0];

    if (!active) return null;

    return (
      <TabsContext
        value={{
          tabs,
          active,
          changeTab: changeTab as (tab: string) => void,
          scrollPos: {
            get: () => {
              return scrollPos.current[active.name] ?? 0;
            },
            set: pos => {
              scrollPos.current[active.name] = pos;
            },
          },
          footer,
        }}
      >
        <Component tab={active} />
      </TabsContext>
    );
  };
}
