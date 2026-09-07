import { useEffect, useState } from 'react';

import { ReauthNeeded, authStore } from '@/api/auth';
import { InvalidOrigin } from '@/api/client';
import { LLClient } from '@/api/ll';
import { Resort, loadResort } from '@/api/resort';
import { VQClient } from '@/api/vq';
import ClientsContext, { createClients } from '@/contexts/ClientsContext';
import ResortContext from '@/contexts/ResortContext';
import { DateTime } from '@/datetime';
import useDisclaimer from '@/hooks/useDisclaimer';
import useNews from '@/hooks/useNews';
import { navigate } from '@/navigate';
import onVisible from '@/onVisible';

import LoginForm from './LoginForm';
import Merlock from './ll/Merlock';
import BGClient from './vq/BGClient';

/**
 * Bumped to show the release notes once.
 *
 * `useNews` renders the News screen while the stored version is lower, with a
 * Close button that stores this one -- so a bump is seen once per device and
 * never again. It sat at 0 forever, which made `0 < 0` false and the screen
 * unreachable: news.html was published and linked from nothing. v1.0 renames
 * the app and asks anyone with the old userscript to remove it, which is
 * exactly the kind of thing worth saying once on launch.
 */
export const NEWS_VERSION = 1;

function disableDoubleTapZoom() {
  document.body.addEventListener('click', () => null);
}

export default function App() {
  const [resort, setResort] = useState<Resort>();
  const [content, setContent] = useState(<div />);
  const disclaimer = useDisclaimer();
  const news = useNews(NEWS_VERSION);
  const [loginRequired, requireLogin] = useState(() => {
    try {
      authStore.getData();
    } catch (e) {
      if (!(e instanceof ReauthNeeded)) throw e;
      return true;
    }
    return false;
  });

  useEffect(() => {
    disableDoubleTapZoom();
    authStore.onUnauthorized = () => requireLogin(true);
    (async () => {
      for (const [Client, Component] of [
        [LLClient, Merlock],
        [VQClient, BGClient],
      ] as const) {
        try {
          const resort = await loadResort(Client.originToResortId(origin));
          setResort(resort);
          DateTime.setTimeZone(
            {
              WDW: 'America/New_York',
              DLR: 'America/Los_Angeles',
            }[resort.id]
          );
          setContent(
            <ResortContext value={resort}>
              <ClientsContext value={createClients(resort)}>
                <Component />
              </ClientsContext>
            </ResortContext>
          );
          return;
        } catch (error) {
          if (!(error instanceof InvalidOrigin)) throw error;
        }
      }
      navigate('https://mbs1234.github.io/AutoLL/start.html');
    })();
  }, []);

  useEffect(() => {
    function checkAuth() {
      if (loginRequired) return;
      try {
        authStore.getData();
        requireLogin(false);
      } catch {
        requireLogin(true);
      }
    }
    checkAuth();
    return onVisible(checkAuth);
  }, [loginRequired]);

  return (
    disclaimer ||
    news ||
    (loginRequired && resort && (
      <LoginForm
        resort={resort}
        onLogin={data => {
          authStore.setData(data);
          requireLogin(false);
        }}
      />
    )) ||
    content
  );
}
