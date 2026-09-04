import { Resort } from '@/api/resort';
import { DateTime } from '@/datetime';
import kvdb from '@/kvdb';

const PING_URL = 'https://bg1.joelface.com/ping';

// Upstream reports an anonymized daily usage count (resort + service) to the
// author's server. Disabled in this fork -- a personal build has no reason to
// phone home. Set to true to restore upstream behavior.
//
// Annotated `: boolean` on purpose: without it TypeScript narrows to the
// literal `false` and treats everything below as unreachable.
const PING_ENABLED: boolean = false;

type ServiceCode = 'D' | 'G' | 'V';

export async function ping(
  resort: Pick<Resort, 'id'>,
  service: ServiceCode
): Promise<void> {
  if (!PING_ENABLED) return;
  const { date } = DateTime.now();
  const pingDateKey = `bg1.ping.${resort.id}.${service}`;
  const pingDate = kvdb.get<string>(pingDateKey);
  if (pingDate === date) return;
  const { ok } = await fetch(PING_URL, {
    method: 'POST',
    body: new URLSearchParams({ resort: resort.id, service }),
  });
  if (ok) kvdb.set<string>(pingDateKey, date);
}
