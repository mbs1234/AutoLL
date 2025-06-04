const URL_PREFIX =
  'https://cdn1.parksmedia.wdprapps.disney.com/resize/mwImage/1/90/90/75/';
const URL_DEFAULT =
  URL_PREFIX + 'dam/wdpro-assets/avatars/180x180/RetAvatar_180x180_';
const URL_HYPHEN =
  URL_PREFIX + 'dam/wdpro-assets/avatars/180x180/RetAvatar-180x180-';
const URL_VIS =
  URL_PREFIX +
  'vision-dam/digital/parks-platform/parks-standard-assets/parks/profile/avatar-180x180/RetAvatar_180x180_';
const URL_50TH =
  URL_PREFIX +
  'dam/disney-world/50th-anniversary/avatars/RetAvatar_180x180_50th_';

export const avatars: { [id: string]: string[] } = {
  48199: ['Mr-Incredible'],
  48200: ['Mrs-Incredible'],
  48201: ['Fronzone', URL_VIS],
  177676: ['Evil-Queen', URL_VIS],
  203075: ['Lightning'],
  261227: ['Nemo'],
  339625: ['Russell'],
  339626: ['Carl'],
  364907: ['Jack-Skellington'],
  431014: ['Princess-Tiana'],
  431065: ['Darth_Vader'],
  431486: ['DrFacilier', URL_VIS],
  15549505: ['Rapunzel'],
  15655408: ['Default_SignedIn'],
  15675686: ['Crush'],
  15831168: ['Wall-E'],
  16453979: ['Merida'],
  16726412: ['Stormtrooper'],
  16818199: ['Violet'],
  16869301: ['Jack-Jack'],
  17345357: ['R2-D2'],
  17345359: ['C-3PO'],
  17532220: ['Bruce'],
  17532224: ['Green-Alien'],
  17532227: ['Kermit'],
  17532228: ['Sorcerer-Mickey'],
  17577168: ['Elsa'],
  17577169: ['Anna'],
  17813977: ['Olaf'],
  17888784: ['Yoda'],
  18101167: ['Captain-Mickey'],
  18368743: ['Nick', URL_HYPHEN],
  18368747: ['Judy', URL_HYPHEN],
  18393706: ['Flash', URL_HYPHEN],
  18403761: ['kion'],
  18405224: ['Moana', URL_HYPHEN],
  18405236: ['Elena', URL_HYPHEN],
  18524539: ['Maui', URL_VIS],
  19633995: ['Mickey', URL_50TH],
  19633996: ['Minnie', URL_50TH],
  90003817: ['Aladdin', URL_VIS],
  90003819: ['Alice'],
  90003846: ['Ariel'],
  90003898: ['Belle'],
  90003967: ['Buzz'],
  90003976: ['Captain-Hook'],
  90004004: ['Chesire-Cat'],
  90004017: ['Cinderella'],
  90004059: ['Cruella', URL_VIS],
  90004068: ['Daisy'],
  90004076: ['Dash'],
  90004104: ['Donald'],
  90004210: ['Gaston', URL_VIS],
  90004228: ['Goofy'],
  90004258: ['Hades', URL_VIS],
  90004260: ['Hamm'],
  90004278: ['Hercules', URL_VIS],
  90004321: ['Jafar', URL_VIS],
  90004328: ['Princess-Jasmine'],
  90004340: ['Jiminy'],
  90004395: ['Lady'],
  90004398: ['Lady-Tremaine', URL_VIS],
  90004449: ['Maleficent', URL_VIS],
  90004482: ['Mickey-Mouse'],
  90004486: ['Minnie'],
  90004537: ['Mulan'],
  90004605: ['Peter-Pan'],
  90004625: ['Pluto'],
  90004626: ['Pocahontas'],
  90004642: ['Princess-Aurora'],
  90004661: ['Queen-of-Hearts', URL_VIS],
  90004682: ['Rex'],
  90004772: ['Snow-White'],
  90004778: ['Sparky'],
  90004789: ['Stitch', URL_VIS],
  90004840: ['Tigger', URL_VIS],
  90004846: ['TinkerBell'],
  90004860: ['Tramp'],
  90004921: ['Winnie-the-Pooh', URL_VIS],
  90004939: ['Zero'],
  411672332: ['Raya', URL_VIS],
  411678097: ['Mirabel', URL_VIS],
  411678099: ['Miguel', URL_VIS],
  411771889: ['Bruno', URL_VIS],
  411821980: ['Antonio', URL_VIS],
  411822047: ['Joe-Gardner', URL_VIS],
  411822056: ['Luisa', URL_VIS],
  411984897: ['Figment', URL_VIS],
  412070168: ['50th_Meilin', URL_VIS],
  412397304: ['Scar', URL_VIS],
  412397306: ['Ursula', URL_VIS],
};

export function avatarUrl(characterId: string | undefined): string | undefined {
  const avatarUrlParts = avatars[characterId ?? ''];
  if (!avatarUrlParts) return;
  const [name, prefix = URL_DEFAULT] = avatarUrlParts;
  return `${prefix}${name}.png`;
}
