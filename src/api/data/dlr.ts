import { ResortData } from '../resort';

const dl = {
  id: '330339',
  name: 'Disneyland',
  icon: '🏰',
  geo: {
    n: 33.8163919,
    s: 33.8091255,
    e: -117.9155825,
    w: -117.9243814,
  },
  color: 'fuchsia',
};
const ca = {
  id: '336894',
  name: 'California Adventure',
  icon: '🎡',
  geo: {
    n: 33.8091255,
    s: 33.8037845,
    e: -117.9155825,
    w: -117.9243814,
  },
  color: 'gold',
};

export const parks: ResortData['parks'] = [dl, ca];

// Disneyland - Lands
const mainStreet = {
  name: 'Main Street, USA',
  sort: 1,
  color: 'red',
  park: dl,
};
const adventureland = {
  name: 'Adventureland',
  sort: 2,
  color: 'green',
  park: dl,
};
const newOrleans = {
  name: 'New Orleans Square',
  sort: 3,
  color: 'purple',
  park: dl,
};
const bayou = {
  name: 'Bayou Country',
  sort: 4,
  color: 'blue',
  park: dl,
};
const starWars = {
  name: "Star Wars: Galaxy's Edge",
  sort: 5,
  color: 'gray',
  park: dl,
};
const frontierland = {
  name: 'Frontierland',
  sort: 6,
  color: 'gold',
  park: dl,
};
const fantasyland = {
  name: 'Fantasyland',
  sort: 7,
  color: 'fuchsia',
  park: dl,
};
const toontown = {
  name: "Mickey's Toontown",
  sort: 8,
  color: 'orange',
  park: dl,
};
const tomorrowland = {
  name: 'Tomorrowland',
  sort: 9,
  color: 'cyan',
  park: dl,
};

// California Adventure -  Lands
const buenaVista = {
  name: 'Buena Vista Street',
  sort: 1,
  color: 'orange',
  park: ca,
};
const hollywood = {
  name: 'Hollywood Land',
  sort: 2,
  color: 'fuchsia',
  park: ca,
};
const avengers = {
  name: 'Avengers Campus',
  sort: 3,
  color: 'gray',
  park: ca,
};
const cars = {
  name: 'Cars Land',
  sort: 4,
  color: 'red',
  park: ca,
};
const pixar = {
  name: 'Pixar Pier',
  sort: 6,
  color: 'gold',
  park: ca,
};
const grizzly = {
  name: 'Grizzly Peak',
  sort: 7,
  color: 'green',
  park: ca,
};
const paradise = {
  name: 'Paradise Gardens Park',
  sort: 8,
  color: 'cyan',
  park: ca,
};

export const experiences: ResortData['experiences'] = {
  // Disneyland - Attractions
  367495: {
    name: 'Alice in Wonderland',
    land: fantasyland,
    type: 'A',
    highlight: true,
  },
  353291: {
    name: 'Astro Orbitor',
    land: tomorrowland,
    type: 'A',
  },
  353293: {
    name: 'Autopia',
    land: tomorrowland,
    type: 'A',
    geo: [33.8126634, -117.9167994],
    priority: 4.5,
  },
  353295: {
    name: 'Big Thunder Mountain Railroad',
    land: frontierland,
    type: 'A',
    geo: [33.8124801, -117.9205132],
    priority: 4.2,
    highlight: true,
  },
  353301: {
    name: 'Buzz Lightyear Astro Blasters',
    land: tomorrowland,
    type: 'A',
    geo: [33.8122751, -117.9181819],
    priority: 4.6,
    highlight: true,
  },
  353305: {
    name: 'Casey Jr. Circus Train',
    land: fantasyland,
    type: 'A',
  },
  353337: {
    name: "Chip 'n' Dale's GADGETcoaster",
    land: toontown,
    type: 'A',
  },
  353311: {
    name: "Davy Crockett's Explorer Canoes",
    land: frontierland,
    type: 'A',
  },
  353323: {
    name: 'Dumbo the Flying Elephant',
    land: fantasyland,
    type: 'A',
  },
  353325: {
    name: 'Enchanted Tiki Room',
    land: adventureland,
    type: 'A',
  },
  353327: {
    name: 'Finding Nemo Submarine Voyage',
    land: tomorrowland,
    type: 'A',
  },
  353347: {
    name: 'Haunted Mansion',
    land: newOrleans,
    type: 'A',
    geo: [33.811616, -117.9218924],
    priority: 4.3,
    highlight: true,
  },
  18249927: {
    name: 'Haunted Mansion Holiday',
    land: newOrleans,
    type: 'A',
    geo: [33.811616, -117.9218924],
    priority: 2.0,
    highlight: true,
  },
  353355: {
    name: 'Indiana Jones Adventure',
    land: adventureland,
    type: 'A',
    geo: [33.8114097, -117.9204077],
    priority: 1.0,
    highlight: true,
  },
  367492: {
    name: "it's a small world",
    land: fantasyland,
    type: 'A',
    geo: [33.8144167, -117.9181268],
  },
  18237232: {
    name: "it's a small world Holiday",
    land: fantasyland,
    type: 'A',
    geo: [33.8144167, -117.9181268],
    highlight: true,
  },
  353363: {
    name: 'Jungle Cruise',
    land: adventureland,
    type: 'A',
    highlight: true,
  },
  353365: {
    name: 'King Arthur Carrousel',
    land: fantasyland,
    type: 'A',
  },
  353369: {
    name: 'Mad Tea Party',
    land: fantasyland,
    type: 'A',
  },
  353449: {
    name: 'Many Adventures of Winnie the Pooh',
    land: bayou,
    type: 'A',
  },
  353377: {
    name: 'Matterhorn Bobsleds',
    land: fantasyland,
    type: 'A',
    geo: [33.8127838, -117.9182386],
    priority: 2.0,
    highlight: true,
  },
  411821333: {
    name: "Mickey & Minnie's Runaway Railway",
    land: toontown,
    type: 'A',
    geo: [33.8154852, -117.9183938],
    priority: 4.0,
    highlight: true,
  },
  19193459: {
    name: 'Millennium Falcon: Smugglers Run',
    land: starWars,
    type: 'A',
    geo: [33.8153228, -117.922197],
    priority: 4.4,
    highlight: true,
  },
  353389: {
    name: "Mr. Toad's Wild Ride",
    land: fantasyland,
    type: 'A',
  },
  353399: {
    name: "Peter Pan's Flight",
    land: fantasyland,
    type: 'A',
    highlight: true,
  },
  353401: {
    name: "Pinocchio's Daring Journey",
    land: fantasyland,
    type: 'A',
  },
  353403: {
    name: "Pirate's Lair on Tom Sawyer Island",
    land: frontierland,
    type: 'A',
  },
  353405: {
    name: 'Pirates of the Caribbean',
    land: newOrleans,
    type: 'A',
    geo: [33.811295, -117.9209785],
    highlight: true,
  },
  19193461: {
    name: 'Rise of the Resistance',
    land: starWars,
    type: 'A',
    geo: [33.8135671, -117.9236346],
    highlight: true,
  },
  353421: {
    name: "Roger Rabbit's Car Toon Spin",
    land: toontown,
    type: 'A',
    geo: [33.8155682, -117.9181205],
    priority: 4.1,
    highlight: true,
  },
  353429: {
    name: "Snow White's Enchanted Wish",
    land: fantasyland,
    type: 'A',
  },
  353435: {
    name: 'Space Mountain',
    land: tomorrowland,
    type: 'A',
    geo: [33.8112647, -117.9175892],
    priority: 1.2,
    highlight: true,
  },
  18237368: {
    name: 'Hyperspace Mountain',
    land: tomorrowland,
    type: 'A',
    geo: [33.8112647, -117.9175892],
    priority: 1.1,
    highlight: true,
  },
  353439: {
    name: 'Star Tours',
    land: tomorrowland,
    type: 'A',
    geo: [33.8119436, -117.9182118],
  },
  353443: {
    name: 'Storybook Land Canal Boats',
    land: fantasyland,
    type: 'A',
  },
  412062678: {
    name: "Tiana's Bayou Adventure",
    land: bayou,
    type: 'A',
    geo: [33.8124171, -117.9222263],
    priority: 1.1,
    highlight: true,
  },

  // Disneyland - Entertainment
  412333563: {
    name: 'Celebrate Happy Cavalcade',
    land: mainStreet,
    type: 'E',
  },
  401463: {
    name: 'Dapper Dans',
    land: mainStreet,
    type: 'E',
  },
  401483: {
    name: 'Fantasmic!',
    land: frontierland,
    type: 'E',
  },
  19444352: {
    name: 'Magic Happens Parade',
    land: mainStreet,
    type: 'E',
  },
  19259687: {
    name: "Mickey's Mix Magic (Fireworks)",
    land: mainStreet,
    type: 'E',
  },
  19263037: {
    name: "Mickey's Mix Magic (Projections)",
    land: mainStreet,
    type: 'E',
  },
  412287389: {
    name: 'Paint the Night',
    land: mainStreet,
    type: 'E',
  },
  17346575: {
    name: 'Storytelling at Royal Theatre',
    land: fantasyland,
    type: 'E',
  },
  412343720: {
    name: 'Tapestry of Happiness',
    land: fantasyland,
    type: 'E',
  },
  412109781: {
    name: 'Together Forever - Pixar Nighttime Spectacular (Fireworks)',
    land: mainStreet,
    type: 'E',
  },
  412113817: {
    name: 'Together Forever - Pixar Nighttime Spectacular (Projections)',
    land: mainStreet,
    type: 'E',
  },

  // Disneyland - Characters
  18738682: {
    name: 'Disney Princesses (Royal Hall)',
    land: fantasyland,
    type: 'C',
  },
  401526: {
    name: "Mickey (Mickey's House)",
    land: toontown,
    type: 'C',
  },
  401524: {
    name: 'Tinker Bell (Pixie Hollow)',
    land: fantasyland,
    type: 'C',
  },

  // Disneyland - Holiday
  424945: {
    name: 'Believe… in Holiday Magic Fireworks',
    land: mainStreet,
    type: 'H',
  },
  3908469: {
    name: 'Christmas Fantasy Parade',
    land: mainStreet,
    type: 'H',
  },
  19348571: {
    name: 'Halloween Screams (Fireworks)',
    land: mainStreet,
    type: 'H',
  },
  19348570: {
    name: 'Halloween Screams (Projections)',
    land: mainStreet,
    type: 'H',
  },
  18847498: {
    name: "it's a small world Holiday Lighting",
    land: fantasyland,
    type: 'H',
  },
  15756384: {
    name: 'Wintertime Enchantment',
    land: mainStreet,
    type: 'H',
  },

  // California Adventure - Attractions
  353341: {
    name: 'Golden Zephyr',
    land: paradise,
    type: 'A',
  },
  15822029: {
    name: "Goofy's Sky School",
    land: paradise,
    type: 'A',
    geo: [33.8062523, -117.9228425],
    priority: 4.1,
    highlight: true,
  },
  353345: {
    name: 'Grizzly River Run',
    land: grizzly,
    type: 'A',
    geo: [33.8069638, -117.9212689],
    priority: 4.2,
  },
  353451: {
    name: 'Guardians of the Galaxy - Mission: BREAKOUT',
    land: avengers,
    type: 'A',
    geo: [33.8068606, -117.9172434],
    priority: 1.0,
    highlight: true,
  },
  18774860: {
    name: 'Guardians of the Galaxy - Monsters After Dark',
    land: avengers,
    type: 'A',
    geo: [33.8068606, -117.9172434],
    priority: 1.1,
    highlight: true,
  },
  353303: {
    name: 'Incredicoaster',
    land: pixar,
    type: 'A',
    geo: [33.8046948, -117.9207725],
    priority: 4.4,
    highlight: true,
  },
  19285637: {
    name: 'Inside Out Emotional Whirlwind',
    land: pixar,
    type: 'A',
  },
  353367: {
    name: "Jessie's Critter Carousel",
    land: pixar,
    type: 'A',
  },
  353361: {
    name: "Jumpin' Jellyfish",
    land: paradise,
    type: 'A',
  },
  15575069: {
    name: "Little Mermaid - Ariel's Undersea Adventure",
    land: paradise,
    type: 'A',
    geo: [33.8065649, -117.9210374],
    priority: 4.5,
  },
  18343088: {
    name: "Luigi's Rollickin' Roadsters",
    land: cars,
    type: 'A',
  },
  18752877: {
    name: "Luigi's Honkin' Haul-O-Ween",
    land: cars,
    type: 'A',
  },
  18848246: {
    name: "Luigi's Joy to the Whirl",
    land: cars,
    type: 'A',
  },
  16514431: {
    name: "Mater's Junkyard Jamboree",
    land: cars,
    type: 'A',
  },
  18752875: {
    name: "Mater's Graveyard JamBOOree",
    land: cars,
    type: 'A',
  },
  18848247: {
    name: "Mater's Jingle Jamboree",
    land: cars,
    type: 'A',
  },
  19299875: {
    name: "Mickey's PhilharMagic",
    land: hollywood,
    type: 'A',
  },
  353387: {
    name: 'Monsters, Inc.',
    land: hollywood,
    type: 'A',
    geo: [33.8081471, -117.9175137],
    priority: 4.3,
    highlight: true,
  },
  353379: {
    name: 'Pixar Pal-A-Round - Swinging',
    land: pixar,
    type: 'A',
  },
  16514416: {
    name: 'Radiator Springs Racers',
    land: cars,
    type: 'A',
    geo: [33.8052475, -117.9198715],
    highlight: true,
  },
  353413: {
    name: 'Redwood Creek Challenge Trail',
    land: grizzly,
    type: 'A',
  },
  15510732: {
    name: 'Silly Symphony Swings',
    land: paradise,
    type: 'A',
  },
  353431: {
    name: "Soarin' Around the World",
    land: grizzly,
    type: 'A',
    geo: [33.8085516, -117.9204917],
    priority: 2.0,
    highlight: true,
  },
  19324604: {
    name: "Soarin' Over California",
    land: grizzly,
    type: 'A',
    geo: [33.8085516, -117.9204917],
    priority: 2.2,
    highlight: true,
  },
  353453: {
    name: 'Toy Story Midway Mania',
    land: pixar,
    type: 'A',
    geo: [33.804614, -117.9216383],
    priority: 3.0,
    highlight: true,
  },
  19531124: {
    name: 'WEB SLINGERS',
    land: avengers,
    type: 'A',
    geo: [33.8067598, -117.91849],
    priority: 4.0,
    highlight: true,
  },

  // California Adventure - Entertainment
  19630108: {
    name: 'Amazing Spider-Man',
    land: avengers,
    type: 'E',
  },
  19630107: {
    name: 'Avengers Assemble!',
    land: avengers,
    type: 'E',
  },
  411459995: {
    name: 'Better Together - Pixar Parade',
    land: buenaVista,
    type: 'E',
  },
  412357973: {
    name: 'Disney Jr. Mickey Clubhouse Live',
    land: hollywood,
    type: 'E',
  },
  19630109: {
    name: 'Dr. Strange: Mystic Arts',
    land: avengers,
    type: 'E',
  },
  16633170: {
    name: 'Five & Dime',
    land: buenaVista,
    type: 'E',
  },
  353457: {
    name: 'Turtle Talk with Crush',
    land: hollywood,
    type: 'E',
  },
  411805943: {
    name: 'Wondrous Journeys (Fireworks)',
    land: mainStreet,
    type: 'E',
  },
  411805942: {
    name: 'Wondrous Journeys (Projections)',
    land: mainStreet,
    type: 'E',
  },
  401479: {
    name: 'World of Color',
    land: paradise,
    type: 'E',
  },
  412278312: {
    name: 'World of Color Happiness!',
    land: paradise,
    type: 'E',
  },
  411805933: {
    name: 'World of Color - ONE',
    land: paradise,
    type: 'E',
  },

  // California Adventure - Holiday
  18614009: {
    name: 'Hurry Home - Lunar New Year Celebration',
    land: paradise,
    type: 'H',
  },
  19354444: {
    name: "Mickey's Trick & Treat",
    land: hollywood,
    type: 'H',
  },
  17595196: {
    name: 'Viva Navidad Street Party',
    land: paradise,
    type: 'H',
  },
  18492231: {
    name: 'World of Color - Season of Light',
    land: paradise,
    type: 'H',
  },

  // Ignored
  18407713: null,
  412420542: null,
};
