import { use, useCallback, useEffect, useState } from 'react';

import { authStore } from '@/api/auth';
import { Queue } from '@/api/vq';
import Button from '@/components/Button';
import Screen from '@/components/Screen';
import RefreshButton from '@/components/ll/screens/RefreshButton';
import ClientsContext from '@/contexts/ClientsContext';
import ThemeContext from '@/contexts/ThemeContext';
import useDataLoader from '@/hooks/useDataLoader';
import onVisible from '@/onVisible';

import QueueListing from './QueueListing';

const isAttraction = (queue: Queue) => queue.categoryContentId === 'attraction';
const isActive = (queue: Queue) =>
  queue.isAcceptingPartyCreation || queue.isAcceptingJoins;

export default function SelectQueue() {
  const { vq } = use(ClientsContext);
  const theme = use(ThemeContext);
  const { loadData, loaderElem } = useDataLoader();
  const [queues, setQueues] = useState<Queue[]>();

  const refreshQueues = useCallback(() => {
    loadData(async () => {
      setQueues(
        (await vq.getQueues()).sort(
          (a, b) =>
            +isActive(b) - +isActive(a) || +isAttraction(b) - +isAttraction(a)
        )
      );
    });
  }, [vq, loadData]);

  useEffect(() => {
    refreshQueues();
    return onVisible(refreshQueues);
  }, [refreshQueues]);

  return (
    <Screen
      title="Virtual Queues"
      buttons={<RefreshButton name="Queues" onClick={refreshQueues} />}
      footer={
        <div className="p-2 text-right">
          <Button
            color={`bg-white/90 ${theme.text}`}
            onClick={() => authStore.deleteData()}
          >
            Log Out
          </Button>
        </div>
      }
    >
      {!queues ? null : queues.length > 0 ? (
        <ul className="dividers mt-1">
          {queues.map(q => (
            <li key={q.id}>
              <QueueListing queue={q} />
            </li>
          ))}
        </ul>
      ) : (
        !loaderElem && (
          <p className="text-gray-500 font-semibold text-center uppercase">
            No virtual queues found
          </p>
        )
      )}
      {loaderElem}
    </Screen>
  );
}
