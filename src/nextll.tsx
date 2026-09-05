import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './components/App';
import NextLLApp from './components/nextll/NextLLApp';

main();

/**
 * A second bookmarklet over the same framework.
 *
 * Identical bootstrap to `bg1.tsx` -- the page is replaced, a viewport meta is
 * added, a blank favicon suppresses the 404 -- differing only in which app
 * `App` mounts once it has worked out the resort and the login.
 */
function main() {
  if (!document.body) {
    setTimeout(main, 100);
    return;
  }

  document.close();
  addViewportMeta();
  addBlankFavicon();
  createAppRoot().render(
    <StrictMode>
      <App llApp={NextLLApp} />
    </StrictMode>
  );
}

function addViewportMeta() {
  const meta = document.createElement('meta');
  meta.name = 'viewport';
  meta.content = 'width=device-width, initial-scale=1, maximum-scale=1';
  document.head.appendChild(meta);
}

function addBlankFavicon() {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = 'data:,';
  document.head.appendChild(link);
}

function createAppRoot() {
  return createRoot(document.body.appendChild(document.createElement('div')));
}
