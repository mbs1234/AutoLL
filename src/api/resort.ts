import { ParkTime } from '@/datetime';

export class Theme {
  readonly color;
  readonly bg;
  readonly text;

  constructor(color: string) {
    this.color = `var(--color-${color})`;
    this.bg = `bg-${color}`;
    this.text = `text-${color}-d`;
  }
}

export interface Park {
  id: string;
  name: string;
  icon: string;
  geo: { n: number; s: number; e: number; w: number };
  color: string;
  theme: Theme;
  dropTimes: ParkTime[];
}

export interface Land {
  name: string;
  sort: number;
  color: string;
  theme: Theme;
  park: Park;
}

export type ExperienceType = 'A' | 'E' | 'C' | 'H';

export interface Experience {
  id: string;
  name: string;
  land: Land;
  park: Park;
  geo?: readonly [number, number];
  type: ExperienceType;
  avgWait?: number;
  tier?: number;
  priority?: number;
  dropTimes?: ParkTime[];
  highlight?: boolean;
}

type ParkData = Omit<Park, 'dropTimes' | 'theme'>;
type LandData = Omit<Land, 'park' | 'theme'> & { park: ParkData };
export type ExperienceData = Omit<
  Experience,
  'id' | 'land' | 'park' | 'dropTimes'
> & {
  land: LandData;
  dropTimes?: string[];
};

export interface ResortData {
  parks: ParkData[];
  experiences: {
    [id: string | number]: ExperienceData | null | undefined;
  };
}

export class InvalidId extends Error {
  name = 'InvalidId';

  constructor(id: string) {
    super(`Invalid ID: ${id}`);
  }
}

export class Resort {
  readonly id: 'WDW' | 'DLR';
  readonly parks: Park[];
  protected parksById: { [id: string]: Park | undefined };
  protected expsById: { [id: string]: Experience | null | undefined };
  protected dropExpsByPark: Map<Park, Experience[]>;

  constructor(id: Resort['id'], data: ResortData) {
    this.id = id;
    this.parks = data.parks as Park[];
    this.parksById = Object.fromEntries(this.parks.map(p => [p.id, p]));
    this.expsById = data.experiences as Resort['expsById'];
    this.dropExpsByPark = new Map(this.parks.map(p => [p, [] as Experience[]]));
    for (const [id, expData] of Object.entries(data.experiences)) {
      if (!expData) continue;
      const exp = expData as Experience;
      exp.id = id;
      exp.park = exp.land.park;
      if (!exp.land.theme) exp.land.theme = new Theme(exp.land.color);
      if (expData.dropTimes) {
        exp.dropTimes = expData.dropTimes.map(ParkTime.from);
        this.dropExpsByPark.get(exp.land.park)?.push(exp);
      }
    }
    for (const park of this.parks) {
      park.theme = new Theme(park.color);
      park.dropTimes = [
        ...new Map(
          this.dropExpsByPark
            .get(park)
            ?.flatMap(exp => (exp.dropTimes ?? []).map(t => [+t, t]))
        ),
      ]
        .map(t => t[1])
        .sort();
      this.dropExpsByPark
        .get(park)
        ?.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  experience(id: string) {
    const exp = this.expsById[id];
    if (exp) return exp;
    if (exp !== null) console.warn(`Missing experience: ${id}`);
    throw new InvalidId(id);
  }

  park(id: string) {
    const park = this.parksById[id];
    if (park) return park;
    throw new InvalidId(id);
  }

  dropExperiences(park: Park) {
    return this.dropExpsByPark.get(park) ?? [];
  }
}

export async function loadResort(id: Resort['id']): Promise<Resort> {
  const data: ResortData = await import(`./data/${id.toLowerCase()}.ts`);
  return new Resort(id, data);
}
