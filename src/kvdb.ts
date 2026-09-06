import { parkDate } from './datetime';
import { migrateLegacyStorage } from './storageKeys';

// On import, so it cannot be ordered after a read: consumers reach storage
// through this module, and several of them do it while their own module is
// still being imported.
migrateLegacyStorage();

interface DailyValue<T> {
  value: T;
  date: string;
}

export default {
  get<T = unknown>(key: string) {
    const json = localStorage.getItem(key);
    try {
      return JSON.parse(json ?? '') as T;
    } catch {
      return undefined;
    }
  },

  set<T = unknown>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  delete(key: string) {
    localStorage.removeItem(key);
  },

  clear() {
    localStorage.clear();
  },

  getDaily<T = unknown>(key: string) {
    const { date, value } = this.get<DailyValue<T>>(key) ?? {};
    return date === parkDate() ? value : undefined;
  },

  setDaily<T = unknown>(key: string, value: T) {
    this.set<DailyValue<T>>(key, { date: parkDate(), value });
  },
};
