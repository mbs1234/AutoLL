import { useEffect } from 'react';

import { AuthData } from '@/api/auth';
import { Resort } from '@/api/resort';
import { sleep } from '@/sleep';

type EventListener = (result: any) => void;

interface OneIdClient {
  init: () => Promise<void>;
  launchLogin: () => void;
  on: (type: string, listener: EventListener) => void;
  off: (type: string, listener: EventListener) => void;
}

declare global {
  interface Window {
    OneID?: {
      get: (config: any) => OneIdClient;
    };
  }
}

const SCRIPT_URL = 'https://cdn.registerdisney.go.com/v4/OneID.js';
const SCRIPT_ID = 'oneid-script';
const WRAPPER_ID = 'oneid-wrapper';

interface OneIdEventListeners {
  login: (data: any) => void;
  close: () => void;
}

class OneId {
  protected static client: OneIdClient | undefined;
  protected static clientId: string;
  protected static listeners: Partial<OneIdEventListeners> = {};

  static async launchLogin(resortId: string, onLogin: any) {
    const client = await this.loadClient(resortId);
    this.on('login', data => {
      onLogin(data);
      this.deleteGuestData();
    });
    this.on('close', () => client.launchLogin());
    client.launchLogin();
  }

  protected static async loadClient(resortId: string) {
    if (!this.client) {
      if (document.getElementById(SCRIPT_ID)) {
        while (!this.client) await sleep(100);
      } else {
        this.loadOneIdScript();
        while (!self.OneID) await sleep(100);
        const os = navigator.userAgent.includes('Android') ? 'AND' : 'IOS';
        this.clientId = `TPR-${resortId}-LBSDK.${os}`;
        const client = self.OneID.get({
          clientId: this.clientId,
          responderPage: 'https://mbs1234.github.io/AutoLL/responder.html',
        });
        await client.init();
        this.client = client;
        this.deleteGuestData();
      }
    }
    return this.client;
  }

  protected static loadOneIdScript() {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    document.head.appendChild(script);
  }

  protected static on<T extends keyof OneIdEventListeners>(
    type: T,
    listener: OneIdEventListeners[T]
  ) {
    const client = OneId.client;
    if (!client) return;
    if (this.listeners[type]) client.off(type, this.listeners[type]);
    this.listeners[type] = listener;
    client.on(type, listener);
  }

  protected static deleteGuestData() {
    localStorage.removeItem(this.clientId + '-PROD.guest');
  }
}

export default function LoginForm({
  resort,
  onLogin,
}: {
  resort: Pick<Resort, 'id'>;
  onLogin: (data: AuthData) => void;
}) {
  useEffect(() => {
    OneId.launchLogin(resort.id, ({ token }: any) => {
      onLogin({
        swid: token.swid,
        accessToken: token.access_token,
        expires: new Date(token.exp).getTime(),
      });
    });
  }, [resort, onLogin]);

  useEffect(() => {
    return () => {
      const wrapper = document.getElementById(WRAPPER_ID);
      wrapper?.parentNode?.removeChild(wrapper);
    };
  }, []);

  return null;
}
