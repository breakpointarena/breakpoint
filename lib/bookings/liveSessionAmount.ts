import { priceSession, playedMinutes } from "@/lib/bookings/walkInSession";
import { round2 } from "@/lib/payments/money";
import { calculateSharedPlayShares, type SharedPlayPeriod } from "@/lib/bookings/sharedPlay";

interface LiveSessionSlot {
  hourly_rate?: number | string | null;
  player_count?: number | null;
  included_players?: number | null;
  extra_player_charge?: number | string | null;
}

interface LiveSessionBooking {
  billed_on_actual_time?: boolean | null;
  shared_play_enabled?: boolean | null;
  status?: string | null;
  checked_in_at?: string | null;
  completed_at?: string | null;
  walk_in_player_count?: number | null;
  device_subtotal?: number | string | null;
  food_subtotal?: number | string | null;
  subscription_discount?: number | string | null;
  promo_discount?: number | string | null;
  happy_hour_discount?: number | string | null;
  booking_device_slots?: LiveSessionSlot[] | null;
  shared_play_participants?: Array<{
    id: string;
    shared_play_periods?: SharedPlayPeriod[];
  }> | null;
}

export interface LiveSessionEstimate {
  playedMinutes: number;
  deviceSubtotal: number;
  totalAmount: number;
}

/** Estimates the current bill for an active walk-in without persisting it. */
export function liveSessionEstimate(
  booking: LiveSessionBooking,
  now: Date = new Date()
): LiveSessionEstimate | null {
  if (
    !booking.billed_on_actual_time ||
    booking.status !== "checked_in" ||
    booking.completed_at ||
    !booking.checked_in_at
  ) {
    return null;
  }

  const startedAt = new Date(booking.checked_in_at);
  if (!Number.isFinite(startedAt.getTime())) return null;

  const slot = booking.booking_device_slots?.[0];
  if (!slot) return null;

  const includedPlayers = Math.max(1, Number(slot.included_players || 1));
  const hourlyRate = Number(slot.hourly_rate || 0);
  const extraPlayerCharge = Number(slot.extra_player_charge || 0);
  let deviceSubtotal: number;
  let playedMinutesForEstimate: number;

  if (booking.shared_play_enabled) {
    const periods = (booking.shared_play_participants || []).flatMap((participant) =>
      (participant.shared_play_periods || []).map((period) => ({
        ...period,
        participant_id: participant.id
      }))
    );
    const calculation = calculateSharedPlayShares(
      periods,
      hourlyRate,
      extraPlayerCharge,
      includedPlayers,
      null,
      now
    );
    deviceSubtotal = round2(calculation.deviceCharges + calculation.extraPlayersTotal);
    playedMinutesForEstimate = Math.ceil(calculation.trackedHours * 60);
  } else {
    const pricing = priceSession({
      playedMinutes: playedMinutes({ startedAt, endedAt: now }),
      hourlyRate,
      playerCount: Number(slot.player_count || booking.walk_in_player_count || includedPlayers),
      includedPlayers,
      extraPlayerCharge,
    });
    deviceSubtotal = pricing.deviceSubtotal;
    playedMinutesForEstimate = pricing.playedMinutes;
  }

  const foodSubtotal = Number(booking.food_subtotal || 0);
  const discounts =
    Number(booking.subscription_discount || 0) +
    Number(booking.promo_discount || 0) +
    Number(booking.happy_hour_discount || 0);

  return {
    playedMinutes: playedMinutesForEstimate,
    deviceSubtotal,
    totalAmount: Math.max(0, round2(deviceSubtotal + foodSubtotal - discounts)),
  };
}
