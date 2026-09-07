import { APP_NAME, APP_SHORT } from '@/appIdentity';
import TabsContext from '@/contexts/TabContext';
import { render, screen } from '@/testing';

import Tab from './Tab';

// Two builds can be installed on the same phone and they look identical.
// `document.title` and the favicon answer the question only where a tab strip
// exists -- not in iOS Safari's normal browsing, and not at all once the page
// is on the Home Screen, which is how this is used.
const tab = (name: string) => ({ name, icon: null, component: () => null });
const tabs = [tab('LL'), tab('Times'), tab('Plans'), tab('NextLL')];

function renderTab(title = 'LL') {
  return render(
    <TabsContext
      value={{
        tabs,
        active: tabs[0]!,
        changeTab: () => {},
        scrollPos: { get: () => 0, set: () => {} },
      }}
    >
      <Tab title={title}>content</Tab>
    </TabsContext>
  );
}

describe('Tab', () => {
  it('names the build in the tab bar', () => {
    renderTab();
    expect(screen.getByText(APP_SHORT)).toBeVisible();
  });

  // The short form is what fits; the full name is what it means.
  it('spells the build out for a screen reader', () => {
    renderTab();
    expect(screen.getByLabelText(`Build: ${APP_NAME}`)).toBeVisible();
  });

  // Beside the tabs, not inside the heading: text inside an <h1> joins its
  // accessible name, which is how every screen in the suite is found.
  it('leaves the heading naming only the screen', () => {
    renderTab('Magic Kingdom');
    expect(
      screen.getByRole('heading', { name: 'Magic Kingdom', level: 1 })
    ).toBeVisible();
  });

  // Titled off the tab names on purpose: the LL screen is headed "LL" and
  // there is also a tab called "LL", so a bare text query matches both.
  it('still renders every tab button', () => {
    renderTab('Magic Kingdom');
    for (const { name } of tabs) expect(screen.getByText(name)).toBeVisible();
  });

  // The label sits left of the tabs without displacing them, so it must not
  // be mistaken for one.
  it('does not add a tab', () => {
    renderTab('Magic Kingdom');
    expect(screen.getAllByRole('button')).toHaveLength(tabs.length);
  });
});
