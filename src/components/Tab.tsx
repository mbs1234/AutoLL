import { use, useLayoutEffect } from 'react';

import { APP_NAME, APP_SHORT } from '@/appIdentity';
import TabsContext from '@/contexts/TabContext';

import Screen, { ScreenProps } from './Screen';
import TabButton from './TabButton';

export default function Tab({
  title,
  buttons,
  subhead,
  children,
  ref,
}: ScreenProps) {
  const { tabs, scrollPos, footer } = use(TabsContext);

  useLayoutEffect(() => {
    const elem = ref?.current;
    if (!elem) return;
    elem.scroll(0, scrollPos.get());
    const updateScrollPos = () => scrollPos.set(elem.scrollTop);
    elem.addEventListener('scroll', updateScrollPos);
    return () => elem.removeEventListener('scroll', updateScrollPos);
  }, [scrollPos, ref]);

  return (
    <Screen
      title={title}
      buttons={buttons}
      subhead={subhead}
      footer={
        <>
          {/* Which build this is, on the one row that is on every screen.
              The header was the other candidate and it does not fit: that row
              is `flex-wrap`, so anything added beside the title pushes the
              buttons onto a second line.
              Absolutely positioned rather than a flex sibling, so the four
              tabs stay centred rather than shifting to make room. On a very
              narrow phone -- 320pt, an old SE -- the label and the first tab
              can meet; on anything current there is room to spare. */}
          <div className="relative flex items-center justify-center">
            <span
              aria-label={`Build: ${APP_NAME}`}
              className="absolute left-2 text-xs font-semibold opacity-60"
            >
              {APP_SHORT}
            </span>
            {tabs.map(tab => (
              <TabButton {...tab} key={tab.name} />
            ))}
          </div>
          {footer}
        </>
      }
      ref={ref}
    >
      {children}
    </Screen>
  );
}
