import { useCallback, useTransition } from 'react';

import Spinner from '@/components/Spinner';
import useFlash from '@/hooks/useFlash';
import { sleep } from '@/sleep';

const LOAD_MIN_MS = 500;

export type DataLoader = (
  callback: (flash: ReturnType<typeof useFlash>[1]) => Promise<void>,
  options?: {
    messages?: {
      error?: string;
      request?: string;
    } & { [httpStatusOrErrorName: string | number]: string };
    minLoadTime?: number;
  }
) => Promise<void>;

export default function useDataLoader(): {
  loaderElem: React.ReactNode;
  loadData: DataLoader;
} {
  const [isPending, startTransition] = useTransition();
  const [flashElem, flash] = useFlash();

  const loadData = useCallback<DataLoader>(
    async (callback, options = {}) => {
      const { messages = {}, minLoadTime = LOAD_MIN_MS } = options;
      const msgs: Required<typeof messages> = {
        error: 'Unknown error occurred',
        request: 'Network request failed',
        ...messages,
      };
      flash('');

      let flashArgs: Parameters<typeof flash> = [''];
      function setFlashArgs(...args: Parameters<typeof flash>) {
        flashArgs = args;
      }

      return new Promise(resolve => {
        startTransition(async () => {
          const awaken = sleep(minLoadTime);
          try {
            await callback(setFlashArgs);
          } catch (error: any) {
            const status = error?.response?.status;
            const { name } = error;
            if (error instanceof Error && msgs[name]) {
              setFlashArgs(msgs[name], 'error');
            } else if (Number.isInteger(status)) {
              // The status and the endpoint, when nothing maps the status.
              // "Network request failed" alone is the fallback for *any*
              // unmapped status, so it said the same thing for a refused
              // request as for a dropped connection -- the one distinction
              // that matters when Disney may be rejecting these calls.
              //
              // 0 is not a status: `fetchJson` uses it when fetch itself
              // threw, so it reads as "no response" rather than as a number
              // no server sent. It is also falsy, which is why it cannot just
              // be filtered out of the pair below.
              const endpoint = error?.path?.split('/').pop();
              const detail = [status || 'no response', endpoint]
                .filter(Boolean)
                .join(' ');
              setFlashArgs(
                msgs[status] ? msgs[status] : `${msgs.request} (${detail})`,
                'error'
              );
            } else {
              console.error(error);
              setFlashArgs(msgs.error, 'error');
            }
          }
          await awaken;
          startTransition(() => flash(...flashArgs));
          resolve();
        });
      });
    },
    [flash]
  );

  const loaderElem =
    isPending || flashElem ? (
      <>
        {isPending && <Spinner />}
        {flashElem}
      </>
    ) : null;
  return { loadData, loaderElem };
}
