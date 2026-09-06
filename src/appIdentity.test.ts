import { APP_ICON, APP_NAME, applyAppIdentity } from './appIdentity';

/** A document of its own, so the suite's real one is not renamed under it. */
function freshDoc(): Document {
  return document.implementation.createHTMLDocument('Disney');
}

describe('applyAppIdentity()', () => {
  // Two builds open at once are two tabs on disneyworld.disney.go.com. The
  // title is what the tab strip shows, and nothing set it before.
  it('names the tab after this build', () => {
    const doc = freshDoc();
    applyAppIdentity(doc);
    expect(doc.title).toBe(APP_NAME);
  });

  it('installs an icon that carries the glyph', () => {
    const doc = freshDoc();
    applyAppIdentity(doc);
    const link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link).not.toBeNull();
    expect(decodeURIComponent(link!.href)).toContain(APP_ICON);
  });

  // It replaced a `data:,` blank. An icon that renders nothing would identify
  // the build no better than the blank did.
  it('is not the blank favicon it replaced', () => {
    const doc = freshDoc();
    applyAppIdentity(doc);
    const link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
    // `getAttribute` rather than `toHaveAttribute`: these elements belong to
    // a document of their own, and jest-dom's matchers test `instanceof`
    // against the suite's window, which a detached document fails.
    /* eslint-disable jest-dom/prefer-to-have-attribute */
    expect(link!.getAttribute('href')).not.toBe('data:,');
    expect(link!.getAttribute('href')).toMatch(/^data:image\/svg\+xml,/);
    /* eslint-enable jest-dom/prefer-to-have-attribute */
  });

  // The whole point is telling two builds apart, so the name has to be this
  // build's rather than the upstream one every fork inherits.
  it('does not call itself bg1', () => {
    expect(APP_NAME.toLowerCase()).not.toBe('bg1');
  });
});
