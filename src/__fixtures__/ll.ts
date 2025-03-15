import {
  BoardingGroup,
  Booking,
  LLMP,
  LightningLane,
  ParkPass,
  Reservation,
} from '@/api/itinerary';
import { FlexExperience, Guest, HourlySlots, Offer } from '@/api/ll';
import { DateTime } from '@/datetime';
import { TODAY, TOMORROW } from '@/testing';

import { ak, hs, itinerary, ll, mk, wdw } from './resort';

export * from './resort';

export const mickey = {
  id: 'mickey',
  name: 'Mickey Mouse',
  primary: true,
  avatarImageUrl: undefined,
  orderDetails: {
    externalIdentifier: {
      id: 'mickey-id',
      idType: 'titus-guest-item-externalId',
    },
    orderId: 'mickey-orderId',
    orderItemId: 'mickey-orderItemId',
  },
};
export const minnie = {
  id: 'minnie',
  name: 'Minnie Mouse',
  primary: false,
  avatarImageUrl: undefined,
  orderDetails: {
    externalIdentifier: {
      id: 'minnie-externalId',
      idType: 'titus-guest-item-id',
    },
    orderId: 'minnie-orderId',
    orderItemId: 'minnie-orderItemId',
  },
};
export const pluto = {
  id: 'pluto',
  name: 'Pluto',
  primary: false,
  avatarImageUrl: undefined,
  orderDetails: {
    externalIdentifier: {
      id: 'pluto-externalId',
      idType: 'titus-guest-item-id',
    },
    orderId: 'pluto-orderId',
    orderItemId: 'pluto-orderItemId',
  },
};
export const donald = {
  id: 'donald',
  name: 'Donald Duck',
  primary: false,
  ineligibleReason: 'INVALID_PARK_ADMISSION' as const,
  avatarImageUrl: undefined,
  orderDetails: {
    externalIdentifier: {
      id: 'donald-externalId',
      idType: 'titus-guest-item-id',
    },
    orderId: 'donald-orderId',
    orderItemId: 'donald-orderItemId',
  },
};

export const guests = {
  eligible: [mickey, minnie, pluto],
  ineligible: [donald],
};

export function omitOrderDetails<T extends { orderDetails?: unknown }>(
  guest: T
): Omit<T, 'orderDetails'> {
  return { ...guest, orderDetails: undefined };
}

export const hm: FlexExperience = {
  ...wdw.experience('80010208'),
  park: mk,
  standby: { available: true, waitTime: 30 },
  flex: { available: true, nextAvailableTime: '11:10:00' },
  priority: 2.3,
};
wdw.experience(hm.id).priority = hm.priority;

export const jc: FlexExperience = {
  ...wdw.experience('80010153'),
  park: mk,
  standby: { available: true, waitTime: 45 },
  flex: {
    available: true,
    nextAvailableTime: '00:00:00',
  },
  priority: 1.1,
};
wdw.experience(jc.id).priority = jc.priority;

export const sm: FlexExperience = {
  ...wdw.experience('80010190'),
  park: mk,
  standby: { available: true, waitTime: 60 },
  flex: { available: true, nextAvailableTime: '10:40:00' },
  priority: 2.0,
};
wdw.experience(sm.id).priority = sm.priority;

export const sdd: FlexExperience = {
  ...wdw.experience('18904138'),
  park: hs,
  standby: { available: true, waitTime: 75 },
  flex: { available: false },
};

export function createBooking(
  experience: FlexExperience,
  {
    date = TODAY,
    guests = [mickey, minnie, pluto],
    properties,
  }: {
    date?: string;
    guests?: Guest[];
    properties?: Partial<LLMP>;
  } = {}
): LLMP {
  const bookingGuests = guests
    .map(omitOrderDetails)
    .map(g => ({ ...g, entitlementId: `${experience.id}-${g.id}` }));
  return {
    type: 'LL',
    subtype: 'MP',
    facilityId: experience.id,
    name: experience.name,
    experience: wdw.experience(experience.id),
    park: experience.park,
    land: experience.land,
    start: new DateTime(date, '11:00:00'),
    end: new DateTime(date, '12:00:00'),
    cancellable: true,
    modifiable: true,
    guests: bookingGuests,
    id: bookingGuests[0].entitlementId,
    ...properties,
  };
}

export const booking = createBooking(hm);

export const multiExp: LightningLane = {
  type: 'LL',
  subtype: 'OTHER',
  facilityId: sdd.id,
  name: sdd.name,
  experience: wdw.experience(sdd.id),
  land: sdd.land,
  park: sdd.park,
  start: new DateTime(TODAY, '15:15:00'),
  end: { date: TODAY, time: undefined },
  cancellable: false,
  modifiable: false,
  guests: [
    { ...mickey, entitlementId: 're1515_01', redemptions: 1 },
    { ...minnie, entitlementId: 're1515_02', redemptions: 1 },
    { ...pluto, entitlementId: 're1515_03', redemptions: 1 },
  ].map(omitOrderDetails),
  choices: [hm, jc, sdd, sm].map(({ id }) => wdw.experience(id)),
  id: 're1515_01',
};

export const allDayExp: LightningLane = {
  type: 'LL',
  subtype: 'OTHER',
  facilityId: sm.id,
  name: sm.name,
  experience: wdw.experience(sm.id),
  land: sm.land,
  park: sm.park,
  start: { date: TODAY, time: undefined },
  end: { date: undefined, time: undefined },
  cancellable: false,
  modifiable: false,
  guests: [{ ...pluto, entitlementId: 'sm_01', redemptions: 2 }].map(
    omitOrderDetails
  ),
  id: 'sm_01',
};

const tron = wdw.experience('411504498');

export const bg: BoardingGroup = {
  type: 'BG',
  facilityId: tron.id,
  name: tron.name,
  experience: tron,
  land: tron.land,
  park: mk,
  boardingGroup: 42,
  status: 'IN_PROGRESS',
  guests: [mickey, minnie, pluto].map(omitOrderDetails),
  start: new DateTime(TODAY, '07:00:00'),
  id: 'tron_01',
};

export const lttRes: Reservation = {
  type: 'RES',
  subtype: 'DINING',
  facilityId: '90001819',
  name: 'Liberty Tree Tavern Lunch',
  land: {
    name: 'Liberty Square',
    park: mk,
    sort: 0,
    theme: { bg: '', text: '' },
  },
  park: mk,
  start: new DateTime(TODAY, '11:15:00'),
  end: undefined,
  guests: [mickey, minnie].map(omitOrderDetails),
  id: '38943;type=DINING',
};

export const mkApr: ParkPass = {
  type: 'APR',
  facilityId: mk.id,
  name: mk.name,
  park: mk,
  start: new DateTime(TODAY, '06:00:00'),
  guests: [mickey, minnie, pluto].map(omitOrderDetails),
  id: 'mk20211001',
};

export const akApr: ParkPass = {
  type: 'APR',
  facilityId: ak.id,
  name: ak.name,
  park: ak,
  start: new DateTime(TOMORROW, '06:00:00'),
  guests: [mickey, minnie, pluto].map(omitOrderDetails),
  id: 'ak20211002',
};

export const expiredLL: LLMP = {
  type: 'LL',
  subtype: 'MP',
  facilityId: jc.id,
  name: jc.name,
  experience: wdw.experience(jc.id),
  land: jc.land,
  park: jc.park,
  start: new DateTime(TODAY, '14:00:00'),
  end: new DateTime(TODAY, '15:00:00'),
  cancellable: true,
  modifiable: false,
  guests: [
    { ...mickey, entitlementId: 'jc1400_01' },
    { ...minnie, entitlementId: 'jc1400_02' },
  ].map(omitOrderDetails),
  id: 'jc1400_01',
};

export const bookings: Booking[] = [
  mkApr,
  bg,
  allDayExp,
  booking,
  lttRes,
  expiredLL,
  multiExp,
  akApr,
];

export const offer: Offer<undefined> = {
  id: '123',
  offerSetId: 'set123',
  start: new DateTime(TODAY, '11:10:00'),
  end: new DateTime(TODAY, '12:10:00'),
  changed: false,
  guests: {
    eligible: [mickey, minnie, pluto],
    ineligible: [],
  },
  experience: hm,
  booking: undefined,
};

export const modOffer: Offer<LLMP> = { ...offer, booking };

export const times: HourlySlots = [
  [
    { startTime: '11:20:00', endTime: '12:20:00' },
    { startTime: '11:40:00', endTime: '12:40:00' },
    { startTime: '11:55:00', endTime: '12:55:00' },
  ],
  [
    { startTime: '12:05:00', endTime: '13:05:00' },
    { startTime: '12:25:00', endTime: '13:25:00' },
    { startTime: '12:45:00', endTime: '13:45:00' },
  ],
];

ll.nextBookTime = '11:00:00';

export function mockOffer(offer: Offer) {
  jest.spyOn(ll, 'offer').mockResolvedValue(offer);
  jest.spyOn(ll, 'lastOffer', 'get').mockReturnValue(jest.mocked(offer));
}

mockOffer(offer);
jest.spyOn(ll, 'guests').mockResolvedValue(guests);
jest.spyOn(ll, 'times').mockResolvedValue(times);
jest.spyOn(ll, 'changeOfferTime').mockResolvedValue(offer);
jest.spyOn(ll, 'book').mockResolvedValue({ ...booking });
jest.spyOn(ll, 'cancelBooking').mockResolvedValue(undefined);
jest.spyOn(itinerary, 'plans').mockResolvedValue([...bookings]);
jest.spyOn(ll, 'experiences').mockResolvedValue([hm, sm, jc]);
jest.spyOn(ll, 'setPartyIds');
