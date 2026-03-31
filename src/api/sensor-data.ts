interface SensorDataModule {
  getSensorData(): Promise<string> | string;
  resetSensorData(): void;
}

let mod: SensorDataModule | undefined;
let loadPromise: Promise<void> | undefined;

function ensureLoaded(): Promise<void> | void {
  if (mod) return;
  if (!loadPromise) {
    const url = import.meta.url.replace(/[^/]*$/, 'sensor-data.js');
    loadPromise = import(/* @vite-ignore */ url).then(m => {
      mod = m as SensorDataModule;
    });
  }
  return loadPromise;
}

export function getSensorData(): Promise<string> | string {
  const pending = ensureLoaded();
  if (pending) return pending.then(() => mod!.getSensorData());
  return mod!.getSensorData();
}

export function resetSensorData(): void {
  mod?.resetSensorData();
}
