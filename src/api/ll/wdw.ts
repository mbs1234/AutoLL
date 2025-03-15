import { DateTime, parkDate, parkMinutes, splitDateTime } from '@/datetime';

import {
  ApiGuest,
  Experience,
  Guest,
  Guests,
  HourlySlots,
  IneligibleReason,
  LLClient,
  LLMP,
  Offer,
  OfferError,
  OfferExperience,
  OrderDetails,
  Slot,
  throwOnNotModifiable,
} from '../ll';
import { InvalidId, Park } from '../resort';

interface GuestsResponse {
  guests: ApiGuest[];
  ineligibleGuests: (ApiGuest & {
    ineligibleReason: {
      ineligibleReason: IneligibleReason;
      isSoftConflict?: boolean;
      metadata?: { facilityIds: string[] };
    };
  })[];
}

interface OfferSetItineraryItem {
  type: 'OFFER_ITEM' | 'EXISTING_ITEM' | 'EVENT_ITEM';
  facilityId: string;
  startDateTime: string;
  endDateTime: string;
}

export interface OfferItem extends OfferSetItineraryItem {
  type: 'OFFER_ITEM';
  offerSetId: string;
  offerId: string;
  offerType: 'FLEX';
  conflict?: 'ALTERNATIVE_TIME_FOUND';
}

interface ExistingItem extends OfferSetItineraryItem {
  type: 'EXISTING_ITEM';
  id: string;
}

interface EventItem extends OfferSetItineraryItem {
  type: 'EVENT_ITEM';
  eventType: 'PARK_OPEN' | 'PARK_CLOSE';
}

interface OfferSetResponse {
  itinerary?: {
    items: (OfferItem | ExistingItem | EventItem)[];
  };
  offerSetGroup?: {
    expirySeconds: number;
    offerSets: {
      offerSetId: string;
      offers: {
        experienceId: string;
        offerId: string;
        offerType: 'FLEX';
      };
      expiryDateTime: string;
    }[];
  };
  party: GuestsResponse;
}

export interface NewBookingResponse {
  entitlementExperiences: {
    experienceId: string;
    startDateTime: string;
    endDateTime: string;
    guests: { entitlementId: string; guestId: string }[];
  }[];
  party: GuestsResponse;
}

export interface ModBookingResponse {
  booking: {
    experienceId: string;
    startDateTime: string;
    endDateTime: string;
    guests: { entitlementId: string; guestId: string }[];
  };
  party: GuestsResponse;
}

export class LLClientWDW extends LLClient {
  readonly rules = {
    maxPartySize: 20,
    parkModify: true,
    prebook: true,
    timeSelect: true,
  };
  #closedExpIds: { [dateParkId: string]: Experience['id'][] | undefined } = {};

  async experiences(park: Park, date: string): Promise<Experience[]> {
    const exps = await super.experiences(park, date);

    if (date > parkDate() || exps.length === 0) {
      const expIds = new Set(exps.map(exp => exp.id));
      const dateParkId = date + park.id;
      if (!this.#closedExpIds[dateParkId]) {
        const { data } = await this.request<{
          tiers: {
            experiences: { facilityId: string; isAvailable?: boolean }[];
          }[];
        }>({
          path: '/ea-vas/planning/api/v1/experiences/availability/bundles/experiences',
          data: {
            parkId: park.id,
            date,
            guestIds: [await this.primaryGuestId()],
            existingOfferIds: [],
            orderId: null,
          },
        });
        this.#closedExpIds[dateParkId] = data.tiers.flatMap(t =>
          t.experiences.map(exp => exp.facilityId).filter(id => !expIds.has(id))
        );
      }

      for (const id of this.#closedExpIds[dateParkId] ?? []) {
        if (expIds.has(id)) continue;
        try {
          exps.push({
            ...this.resort.experience(id),
            flex: { available: false },
            standby: { available: false, unavailableReason: 'CLOSED' },
          });
        } catch (error) {
          if (!(error instanceof InvalidId)) throw error;
        }
      }
    }

    return exps;
  }

  async guests(experience?: { id: string }, date?: string): Promise<Guests> {
    const { data } = await this.request<GuestsResponse>({
      path: '/ea-vas/planning/api/v1/experiences/guest/guests',
      data: {
        date: date ?? new DateTime().date,
        facilityId: experience?.id ?? null,
        parkId: experience
          ? this.resort.experience(experience.id).park.id
          : this.resort.parks[0].id,
      },
    });
    return this.parseGuestData(data);
  }

  async offer<B extends Offer['booking']>(
    experience: OfferExperience,
    guests: Guest[],
    options?: { date: string } | { booking?: B }
  ): Promise<Offer<B>> {
    const today = parkDate();
    const { date, booking: booking } = {
      date: today,
      booking: undefined,
      ...options,
    };
    throwOnNotModifiable(booking);
    const { nextAvailableTime } = experience.flex ?? {};
    const { data } = await this.request<OfferSetResponse>({
      path: `/ea-vas/planning/api/v1/experiences${booking ? '/mod' : ''}/offerset/generate`,
      data: {
        date: booking ? booking.start.date : date,
        parkId: experience.park.id,
        guestIds: guests.map(g => g.id),
        targetedTime: nextAvailableTime ?? '08:00:00',
        ignoredBookedExperienceIds: null,
        ...(booking
          ? {
              experienceId: experience.id,
              originalExperienceId: booking.experience.id,
              originalEntitlementIds: booking.guests.map(g => g.entitlementId),
            }
          : {
              experienceIds: [experience.id],
            }),
      },
    });
    const party = this.parseGuestData(data.party);
    const offerItem = (data.itinerary ?? {}).items?.find(
      item => item.type === 'OFFER_ITEM'
    );
    if (!offerItem) throw new OfferError(party);
    const { offerSetId, offerId, startDateTime, endDateTime } = offerItem;
    const guestsById = Object.fromEntries(guests.map(g => [g.id, g]));
    let offer: Offer<B> = {
      offerSetId,
      id: offerId,
      start: splitDateTime(startDateTime),
      end: splitDateTime(endDateTime),
      experience,
      guests: {
        eligible: party.eligible.map(g => ({ ...guestsById[g.id], ...g })),
        ineligible: party.ineligible,
      },
      changed:
        offerItem.conflict === 'ALTERNATIVE_TIME_FOUND' &&
        nextAvailableTime !== undefined,
      booking: booking as B,
    };
    // When you already have two LLs booked, the system tries to place your
    // third LL in between them rather than offering you the earliest available
    // return time. This is probably not what most people expect or usually
    // want, so we correct for this behavior by trying to change the offer time
    // when it's significantly later than expected.
    if (
      offer.changed &&
      nextAvailableTime &&
      parkMinutes(offer.start.time) - parkMinutes(nextAvailableTime) > 10
    ) {
      try {
        offer = await this.changeOfferTime(offer, {
          startTime: '08:00:00',
          endTime: '08:00:00',
        });
        offer.changed = offer.start.time !== nextAvailableTime;
      } catch (error) {
        // Keep original offer
        console.error(error);
      }
    }
    return this.updateLastOffer(offer);
  }

  async times(offer: Offer): Promise<HourlySlots> {
    const { data } = await this.request<{
      hourSegmentGroups: {
        inventorySlotsAvailability: { startTime: string; endTime: string }[];
      }[];
    }>({
      path: `/ea-vas/planning/api/v1/experiences${offer.booking ? '/mod' : ''}/offerset/times`,
      data: {
        experienceId: offer.experience.id,
        parkId: offer.experience.park.id,
        date: offer.start.date,
        offerId: offer.id,
        offerSetIds: [offer.offerSetId],
        guestIds: offer.guests.eligible.map(g => g.id),
        offerType: 'FLEX',
        experienceIdsToIgnore: [],
        originalOrderItemId: null,
      },
    });
    return data.hourSegmentGroups.map(group =>
      group.inventorySlotsAvailability.map(({ startTime, endTime }) => ({
        startTime,
        endTime,
      }))
    );
  }

  async changeOfferTime<B extends Offer['booking']>(
    offer: Offer<B>,
    slot: Slot
  ): Promise<Offer<B>> {
    const {
      data: { updatedPlanningOfferDisplayItem: newOffer },
    } = await this.request<{
      experienceId: string;
      offerId: string;
      offerSetId: string;
      offerType: 'FLEX';
      updatedPlanningOfferDisplayItem: OfferItem;
    }>({
      path: `/ea-vas/planning/api/v1/experiences${offer.booking ? '/mod' : ''}/offerset/times/fulfill`,
      data: {
        parkId: offer.experience.park.id,
        date: offer.start.date,
        offerId: offer.id,
        ...(offer.booking
          ? { offerSetId: offer.offerSetId }
          : { offerSetIds: [offer.offerSetId] }),
        offerType: 'FLEX',
        guestIds: offer.guests.eligible.map(g => g.id),
        targetSlot: slot,
        experienceIdsToIgnore: [],
      },
    });
    return this.updateLastOffer({
      ...offer,
      id: newOffer.offerId,
      offerSetId: newOffer.offerSetId,
      start: splitDateTime(newOffer.startDateTime),
      end: splitDateTime(newOffer.endDateTime),
      changed: newOffer.conflict === 'ALTERNATIVE_TIME_FOUND',
    });
  }

  async book<B extends Offer['booking']>(
    offer: Offer<B>,
    guestsToModify?: Pick<Guest, 'id'>[]
  ): Promise<LLMP> {
    if (offer.booking) {
      return this.modify(offer as Offer<LLMP>, guestsToModify);
    }
    const { data } = await this.request<NewBookingResponse>({
      path: '/ea-vas/planning/api/v1/experiences/entitlements/book',
      data: {
        offerSetId: offer.offerSetId,
        orderGuestDetails: offer.guests.eligible
          .filter(
            (g): g is Guest & { orderDetails: OrderDetails } => !!g.orderDetails
          )
          .map(({ id, orderDetails: { externalIdentifier, ...ids } }) => ({
            guestDetails: [{ guestId: id, externalIdentifier }],
            ...ids,
          })),
      },
    });
    return this.createLLFromResponse(offer.experience, data);
  }

  protected async modify(
    offer: Offer<LLMP>,
    guestsToModify?: Pick<Guest, 'id'>[]
  ): Promise<LLMP> {
    const {
      offerSetId,
      guests: { eligible },
    } = offer;
    const guestIdsToModify = new Set(
      (guestsToModify ?? offer.guests.eligible).map(g => g.id)
    );
    const entIdsByGuestId = Object.fromEntries(
      offer.booking.guests.map(g => [g.id, g.entitlementId])
    );
    const { data } = await this.request<ModBookingResponse>({
      path: '/ea-vas/planning/api/v1/experiences/mod/entitlements/book',
      data: {
        offerSetId,
        eligibleGuestsEntitlements: eligible
          .filter(g => guestIdsToModify.has(g.id))
          .map(g => ({
            guestId: g.id,
            entitlementId: entIdsByGuestId[g.id],
            ...g.orderDetails,
          })),
      },
    });
    return this.createLLFromResponse(offer.experience, {
      entitlementExperiences: [data.booking],
      party: data.party,
    });
  }

  protected createLLFromResponse(
    experience: OfferExperience,
    response: NewBookingResponse
  ): LLMP {
    const booking = response.entitlementExperiences[0];
    const entIdsByGuestId = Object.fromEntries(
      booking.guests.map(g => [g.guestId, g.entitlementId])
    );
    const { id, name, land, park } = experience;
    return {
      facilityId: id,
      name,
      experience,
      land,
      park,
      type: 'LL',
      subtype: 'MP',
      id: booking.guests[0]?.entitlementId,
      start: splitDateTime(booking.startDateTime),
      end: splitDateTime(booking.endDateTime),
      cancellable: true,
      modifiable: true,
      guests: response.party.guests.map(g => ({
        ...this.convertGuest(g),
        entitlementId: entIdsByGuestId[g.id],
      })),
    };
  }

  protected parseGuestData({ guests, ineligibleGuests }: GuestsResponse) {
    return super.parseGuestData({
      guests,
      ineligibleGuests: ineligibleGuests.map(g =>
        g.ineligibleReason
          ? { ...g, ineligibleReason: g.ineligibleReason.ineligibleReason }
          : g
      ),
    });
  }
}
