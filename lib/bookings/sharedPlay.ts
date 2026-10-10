import { extraPlayersCharge, round2 } from "@/lib/payments/money";

export interface SharedPlayPeriod {
  id: string;
  participant_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface SharedPlayParticipantShare {
  participantId: string;
  amount: number;
}

export interface SharedPlayCalculation {
  shares: SharedPlayParticipantShare[];
  extraPlayersTotal: number;
  trackedHours: number;
}

/**
 * Splits each board-time interval equally between the people playing then.
 * Active players share the reserved base charge by play time. Each active
 * player above the device's included count adds its configured hourly fee to
 * that interval, using the same rounding rule as ordinary bookings.
 */
export function calculateSharedPlayShares(
  periods: SharedPlayPeriod[],
  hourlyRate: number,
  extraPlayerRate: number,
  includedPlayers: number,
  reservedBaseAmount: number | null,
  endedAt: Date
): SharedPlayCalculation {
  const valid = periods.flatMap((period) => {
    const start = new Date(period.started_at).getTime();
    const end = period.ended_at ? new Date(period.ended_at).getTime() : endedAt.getTime();
    return Number.isFinite(start) && Number.isFinite(end) && end > start
      ? [{ ...period, start, end }]
      : [];
  });
  const edges = [...new Set(valid.flatMap((period) => [period.start, period.end]))].sort((a, b) => a - b);
  const centsByParticipant = new Map<string, number>();
  const segments: Array<{ hours: number; activeIds: string[]; extraCents: number }> = [];
  let trackedHours = 0;
  let extraPlayersTotal = 0;

  for (let index = 0; index < edges.length - 1; index += 1) {
    const start = edges[index];
    const end = edges[index + 1];
    const midpoint = start + (end - start) / 2;
    const activeIds = [...new Set(
      valid.filter((period) => period.start <= midpoint && period.end > midpoint)
        .map((period) => period.participant_id)
    )].sort();
    if (activeIds.length === 0) continue;

    const hours = (end - start) / 3_600_000;
    const extraCount = Math.max(0, activeIds.length - Math.max(1, includedPlayers));
    const extraAmount = extraPlayersCharge(extraCount, extraPlayerRate, hours);
    const extraCents = Math.round(extraAmount * 100);
    trackedHours += hours;
    extraPlayersTotal = round2(extraPlayersTotal + extraAmount);
    segments.push({ hours, activeIds, extraCents });
  }

  let allocatedBaseCents = 0;
  const totalBaseCents = Math.round((reservedBaseAmount ?? hourlyRate * trackedHours) * 100);
  segments.forEach((segment, index) => {
    const baseCents = index === segments.length - 1
      ? totalBaseCents - allocatedBaseCents
      : trackedHours > 0
        ? Math.round(totalBaseCents * segment.hours / trackedHours)
        : 0;
    allocatedBaseCents += baseCents;
    const extraBaseShare = Math.floor(segment.extraCents / segment.activeIds.length);
    const extraRemainder = segment.extraCents - extraBaseShare * segment.activeIds.length;
    const baseShare = Math.floor(baseCents / segment.activeIds.length);
    const baseRemainder = baseCents - baseShare * segment.activeIds.length;
    segment.activeIds.forEach((participantId, participantIndex) => {
      centsByParticipant.set(
        participantId,
        (centsByParticipant.get(participantId) || 0) + baseShare +
          (participantIndex < baseRemainder ? 1 : 0) + extraBaseShare +
          (participantIndex < extraRemainder ? 1 : 0)
      );
    });
  });

  return {
    shares: [...centsByParticipant.entries()].map(([participantId, cents]) => ({
      participantId,
      amount: cents / 100,
    })),
    extraPlayersTotal,
    trackedHours,
  };
}

