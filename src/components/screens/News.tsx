import { APP_NAME } from '@/appIdentity';

import Screen from '../Screen';

export default function News() {
  return (
    <Screen title={`${APP_NAME} News`}>
      <iframe
        src="https://mbs1234.github.io/AutoLL/news.html"
        className="absolute inset-0 w-full h-full"
      />
    </Screen>
  );
}
