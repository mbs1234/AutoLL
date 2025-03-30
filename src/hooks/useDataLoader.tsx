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

      startTransition(async () => {
        const awaken = sleep(minLoadTime);
        try {
          await callback(setFlashArgs);
        } catch (error: any) {
          const status = error?.response?.status;
          if (error instanceof Error && msgs[error.name]) {
            setFlashArgs(msgs[error.name], 'error');
          } else if (Number.isInteger(status)) {
            setFlashArgs(status in msgs ? msgs[status] : msgs.request, 'error');
          } else {
            console.error(error);
            setFlashArgs(msgs.error, 'error');
          }
        }
        await awaken;
        startTransition(() => {
          flash(...flashArgs);
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
