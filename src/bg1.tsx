import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { applyAppIdentity } from './appIdentity';
import App from './components/App';

main();

function main() {
  if (!document.body) {
    setTimeout(main, 100);
    return;
  }

  document.close();
  addViewportMeta();
  applyAppIdentity();
  createAppRoot().render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

function addViewportMeta() {
  const meta = document.createElement('meta');
  meta.name = 'viewport';
  meta.content = 'width=device-width, initial-scale=1, maximum-scale=1';
  document.head.appendChild(meta);
}

function createAppRoot() {
  return createRoot(document.body.appendChild(document.createElement('div')));
}
