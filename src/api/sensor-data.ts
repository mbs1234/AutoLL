interface SensorDataModule {
  getSensorData(): Promise<string>;
  resetSensorData(): void;
}

let mod: SensorDataModule | undefined;

async function loadModule(): Promise<SensorDataModule> {
  if (!mod) {
    const base = new URL('.', import.meta.url).href;
    mod = (await import(/* @vite-ignore */ base + 'sensor-data.js')) as SensorDataModule;
  }
  return mod!;
}

export async function getSensorData(): Promise<string> {
  return (await loadModule()).getSensorData();
}

export async function resetSensorData(): Promise<void> {
  (await loadModule()).resetSensorData();
}
