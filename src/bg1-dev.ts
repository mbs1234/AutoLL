addRefreshScript();
import('./bg1');

function addRefreshScript() {
  const script = document.createElement('script');
  script.type = 'module';
  const url = `${new URL('', import.meta.url).origin}/bg1/@react-refresh`;
  script.textContent = `
    import RefreshRuntime from '${url}'
    RefreshRuntime.injectIntoGlobalHook(self)
    self.$RefreshReg$ = () => {}
    self.$RefreshSig$ = () => type => type
    self.__vite_plugin_react_preamble_installed__ = true
  `;
  document.head.appendChild(script);
}
