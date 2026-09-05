import { useState } from 'react';

import {
  click,
  loading,
  render,
  see,
  waitForElementToBeRemoved,
} from '@/testing';

import useDataLoader from './useDataLoader';

jest.useFakeTimers();
jest.spyOn(console, 'error').mockImplementation(() => {});

class WeirdError extends Error {
  readonly name = 'WeirdError';
}

class Error404 extends Error {
  readonly response = { status: 404 };
}

function Test() {
  const { loadData, loaderElem } = useDataLoader();
  const [loaded, setLoaded] = useState(false);

  return (
    <div>
      <button
        onClick={async () => {
          loadData(
            async () => {
              throw new WeirdError();
            },
            { messages: { WeirdError: 'Weird!' } }
          );
        }}
      >
        Weird?
      </button>

      <button
        onClick={async () => {
          loadData(
            async () => {
              throw new Error404();
            },
            { messages: { 404: 'Page not found' } }
          );
        }}
      >
        404
      </button>

      <button
        onClick={async () => {
          loadData(async () => {
            throw new Error404();
          });
        }}
      >
        500
      </button>

      <button
        onClick={async () => {
          loadData(async () => {
            throw new Error();
          });
        }}
      >
        Fail
      </button>

      <button
        onClick={async () => {
          await loadData(async flash => flash('Success!'));
          setLoaded(true);
        }}
      >
        Load
      </button>

      {loaded && 'loaded'}
      {loaderElem}
    </div>
  );
}

async function clickFlash(button: string, flashMessage: string) {
  click(button);
  see.no('loaded');
  await loading();
  await waitForElementToBeRemoved(see(flashMessage), { timeout: 4000 });
}

describe('useDataLoader()', () => {
  it('is accepted after Accept button clicked', async () => {
    render(<Test />);

    await clickFlash('Weird?', 'Weird!');

    await clickFlash('404', 'Page not found');

    // The button is labelled 500 but throws the 404 error with no message map,
    // so this is the unmapped-status path: the status is named rather than
    // hidden behind a word that says "network".
    await clickFlash('500', 'Network request failed (404)');

    expect(console.error).toHaveBeenCalledTimes(0);
    await clickFlash('Fail', 'Unknown error occurred');
    expect(console.error).toHaveBeenCalledTimes(1);

    await clickFlash('Load', 'Success!');
    see('loaded');
  });
});
