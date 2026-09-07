// ==UserScript==
// @name         AutoLL Autoloader
// @namespace    https://joelface.github.io/bg1/
// @version      1.0
// @description  Automatically loads the AutoLL interface
// @author       Joel Bruick (BG1), modified for AutoLL
// @match        https://joelface.github.io/bg1/start.html
// @match        https://disneyworld.disney.go.com/vas/
// @match        https://disneyworld.disney.go.com/*/vas/
// @match        https://disneyland.disney.go.com/vas/
// @match        https://disneyland.disney.go.com/*/vas/
// @match        https://vqguest-svc-wdw.wdprapps.disney.com/application/v1/guest/getQueues
// @match        https://vqguest-svc.wdprapps.disney.com/application/v1/guest/getQueues
// @grant        none
// ==/UserScript==
'use strict';

const bg1Url = 'https://joelface.github.io/bg1/';
if (window.location.href === bg1Url + 'start.html') {
  document.body.classList.add('autoload');
} else if (!window.__llAutoloaderClaimed) {
  // Deliberately NOT namespaced per build: the point is that every
  // bg1-derived autoloader agrees on one flag, so the first to run claims the
  // page and any other installed alongside it stands down. Two of them both
  // calling document.open() blanks the page twice and loads two copies of the
  // app onto it. Renaming @name is what creates that situation -- a manager
  // sees a new script, not an update -- so the guard ships with the rename.
  window.__llAutoloaderClaimed = true;
  document.open();
  document.write(
    `<!doctype html><link rel=stylesheet href="${bg1Url}bg1.css"><body>`
  );
  const script = document.createElement('script');
  script.type = 'module';
  script.src = bg1Url + 'bg1.js';
  document.head.appendChild(script);
}
