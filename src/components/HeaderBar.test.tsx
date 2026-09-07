import { APP_NAME } from '@/appIdentity';
import { render, screen } from '@/testing';

import HeaderBar from './HeaderBar';

// Two builds can be installed on the same phone, and they look identical.
// `document.title` and the favicon say which is which only where a tab strip
// exists -- not in iOS Safari's normal browsing, and not at all once the page
// is on the Home Screen, which is how this is actually used.
describe('HeaderBar', () => {
  it('says which build this is', () => {
    render(<HeaderBar title="LL" />);
    expect(screen.getByText(APP_NAME)).toBeVisible();
  });

  // Beside the heading, not inside it: inside, the build name joins the
  // heading's accessible name, which is both wrong for a screen reader and
  // breaks everything that finds a screen by its title.
  it('leaves the heading naming only the screen', () => {
    render(<HeaderBar title="Magic Kingdom" />);
    expect(
      screen.getByRole('heading', { name: 'Magic Kingdom', level: 1 })
    ).toBeVisible();
  });

  // On every screen, so switching tabs cannot lose the answer.
  it.each(['LL', 'Plans', 'NextLL', 'Autopilot'])(
    'names the build on the %s screen too',
    title => {
      render(<HeaderBar title={title} />);
      expect(screen.getByText(APP_NAME)).toBeVisible();
    }
  );
});
