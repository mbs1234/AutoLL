/**
 * Consistency checks over the resort data files.
 *
 * Deliberately *not* in `src/api/data/`. `loadResort` dynamic-imports
 * `./data/${id}.ts` with a variable, so Rollup pulls every `.ts` in that
 * directory into the bundle -- a test file there breaks `vite build` on its
 * `node:fs` import.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as dlr from './data/dlr';
import * as wdw from './data/wdw';
import { ResortData } from './resort';

/**
 * Which `// <Park> - <Type>` section each experience id is declared under.
 *
 * Read from the source text because the comments are gone by runtime. The
 * sections are the file's own statement of intent, so comparing them against
 * the `land` each entry actually points at catches the copy-paste that put
 * two Animal Kingdom entries in EPCOT's World Discovery -- a mistake nothing
 * else notices, since the tipboard corrects `park` on the way through but
 * `Itinerary.experienceData()` does not.
 */
function sectionsByExperienceId(file: string): Map<string, string> {
  const src = readFileSync(join(__dirname, 'data', file), 'utf8');
  const sections = new Map<string, string>();
  let park = '';
  for (const line of src.split('\n')) {
    const section = /^ {2}\/\/ (.+?) - \w+$/.exec(line);
    if (section?.[1]) park = section[1];
    else if (/^ {2}\/\/ Ignored$/.test(line)) park = '';
    const entry = /^ {2}(\d+): \{$/.exec(line);
    if (entry?.[1] && park) sections.set(entry[1], park);
  }
  return sections;
}

describe.each([
  ['wdw.ts', wdw as unknown as ResortData],
  ['dlr.ts', dlr as unknown as ResortData],
])('%s', (file, data) => {
  const sections = sectionsByExperienceId(file);

  it('declares every experience under a park section', () => {
    const ids = Object.entries(data.experiences)
      .filter(([, exp]) => !!exp)
      .map(([id]) => id);
    expect([...sections.keys()].sort()).toEqual(ids.sort());
  });

  it('puts every experience in a land belonging to its section park', () => {
    const wrong = [...sections].flatMap(([id, park]) => {
      const exp = data.experiences[id];
      if (!exp || exp.land.park.name === park) return [];
      return [`${id} ${exp.name}: ${park} section, ${exp.land.park.name} land`];
    });
    expect(wrong).toEqual([]);
  });
});

describe('wdw.ts', () => {
  // Disney re-issues a facility id when an attraction is re-themed, and an id
  // missing from this file is dropped silently by `LLClient.experiences()`.
  // These three cost a headliner each when they went stale in 2026.
  it.each([
    ['412573652', "Rock 'n' Roller Coaster Starring The Muppets"],
    ['412577054', "Soarin' Across America"],
    ['412521565', 'Disney Jr. Mickey Mouse Clubhouse Live!'],
  ])('carries the current facility id %s', (id, name) => {
    expect(wdw.experiences[id]).toMatchObject({ name });
  });

  it('keeps retired ids listed as null rather than deleting them', () => {
    // Null suppresses the "Missing experience" warning if Disney serves one
    // again, and records that the id was considered rather than overlooked.
    expect(wdw.experiences['80010182']).toBeNull();
    expect(wdw.experiences['19583373']).toBeNull();
  });
});
