import { DateTime } from '@/datetime';
import { fetchJson } from '@/fetch';

import { Experience } from './ll';
import { InvalidId, Park, Resort } from './resort';

interface ShowTimesByParkId {
  [parkId: string]: { [expId: string]: string[] };
}

export class LiveDataClient {
  protected cachedShowTimes: ShowTimesByParkId = {};

  constructor(protected resort: Resort) {}

  async shows(park: Park): Promise<{ [id: string]: Experience }> {
    if (Object.keys(this.cachedShowTimes).length === 0) {
      this.cachedShowTimes = (await this.request('showtimes')).data;
    }
    const showTimesByExpId = this.cachedShowTimes[park.id] ?? {};
    const now = DateTime.now().time;
    return Object.fromEntries(
      Object.entries(showTimesByExpId).flatMap(([id, showTimes]) => {
        const upcomingTimes = showTimes.filter(t => t >= now);
        const available = upcomingTimes.length > 0;
        const unavailableReason = available ? undefined : 'NO_MORE_SHOWS';
        try {
          return [
            [
              id,
              {
                ...this.resort.experience(id),
                park,
                standby: { available, unavailableReason },
                showTimes: upcomingTimes,
              },
            ],
          ];
        } catch (error) {
          if (error instanceof InvalidId) return [];
          throw error;
        }
      })
    );
  }

  protected async request(resource: string) {
    const response = await fetchJson<ShowTimesByParkId>(
      `https://bg1.joelface.com/livedata/${this.resort.id.toLowerCase()}/${resource}.json`
    );
    if (!response.ok) throw new Error('Fetch failed');
    return response;
  }
}
