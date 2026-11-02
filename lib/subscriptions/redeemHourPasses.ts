import { supabaseAdmin } from "@/lib/supabase/server";
import { arenaToday } from "@/lib/utils/dates";
import { calculateHourPassRedemption } from "./hourPass";

export interface HourPassPlayer {
  participantId: string;
  customerId: string;
  playedMinutes: number;
  playerShare: number;
  shareableAmount: number;
}

export interface RedeemedHourPass {
  minutesUsed: number;
  amountCovered: number;
}

/** Atomically consumes each linked player's earliest-expiring valid pass. */
export async function redeemHourPassesForBooking(
  bookingId: string,
  players: HourPassPlayer[]
): Promise<Map<string, RedeemedHourPass>> {
  const result = new Map<string, RedeemedHourPass>();
  if (players.length === 0) return result;

  const { data, error } = await supabaseAdmin.rpc("redeem_booking_hour_passes", {
    p_booking_id: bookingId,
    p_today: arenaToday(),
    p_players: players.map(player => ({
      participant_id: player.participantId,
      customer_id: player.customerId,
      played_minutes: Math.max(0, Math.ceil(player.playedMinutes)),
      player_share: Math.max(0, Number(player.playerShare) || 0),
      shareable_amount: calculateHourPassRedemption(
        player.playedMinutes,
        player.playedMinutes,
        player.playerShare,
        player.shareableAmount
      ).amountCovered,
    })),
  });

  if (error) throw new Error(`Could not redeem hour packs: ${error.message}`);

  for (const row of data || []) {
    result.set(row.participant_id, {
      minutesUsed: Number(row.minutes_used || 0),
      amountCovered: Number(row.amount_covered || 0),
    });
  }

  return result;
}
