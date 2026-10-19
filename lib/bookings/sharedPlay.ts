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
  sessions: SharedPlaySessionAmount[];
  deviceCharges: number;
  extraPlayersTotal: number;
  trackedHours: number;
}

export interface SharedPlaySession {
  participantIds: string[];
  startedAt: number;
  endedAt: number;
}

export interface SharedPlaySessionAmount extends SharedPlaySession {
  amount: number;
}

/** Builds chronological intervals showing exactly who was playing together. */
export function getSharedPlaySessions(
  periods: SharedPlayPeriod[],
  endedAt: Date
): SharedPlaySession[] {
  const valid = periods.flatMap((period) => {
    const start = new Date(period.started_at).getTime();
    const end = period.ended_at ? new Date(period.ended_at).getTime() : endedAt.getTime();
    return Number.isFinite(start) && Number.isFinite(end) && end > start
      ? [{ participantId: period.participant_id, start, end }]
      : [];
  });
  const edges = [...new Set(valid.flatMap((period) => [period.start, period.end]))].sort((a, b) => a - b);
  const sessions: SharedPlaySession[] = [];

  for (let index = 0; index < edges.length - 1; index += 1) {
    const start = edges[index];
    const end = edges[index + 1];
    const midpoint = start + (end - start) / 2;
    const participantIds = [...new Set(
      valid.filter((period) => period.start <= midpoint && period.end > midpoint)
        .map((period) => period.participantId)
    )].sort();
    if (participantIds.length === 0) continue;

    const previous = sessions[sessions.length - 1];
    const samePlayers = previous?.participantIds.length === participantIds.length &&
      previous.participantIds.every((id, playerIndex) => id === participantIds[playerIndex]);
    if (previous && previous.endedAt === start && samePlayers) {
      previous.endedAt = end;
    } else {
      sessions.push({ participantIds, startedAt: start, endedAt: end });
    }
  }

  return sessions;
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
  const segments: Array<{ start: number; end: number; hours: number; activeIds: string[]; extraCents: number }> = [];
  const sessions: Array<SharedPlaySession & { amountCents: number }> = [];
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
    segments.push({ start, end, hours, activeIds, extraCents });
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
    const previousSession = sessions[sessions.length - 1];
    const continuesSameSession = previousSession?.endedAt === segment.start &&
      previousSession.participantIds.length === segment.activeIds.length &&
      previousSession.participantIds.every((id, playerIndex) => id === segment.activeIds[playerIndex]);
    if (continuesSameSession) {
      previousSession.endedAt = segment.end;
      previousSession.amountCents += baseCents + segment.extraCents;
    } else {
      sessions.push({
        participantIds: segment.activeIds,
        startedAt: segment.start,
        endedAt: segment.end,
        amountCents: baseCents + segment.extraCents,
      });
    }
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
    sessions: sessions.map(({ amountCents, ...session }) => ({
      ...session,
      amount: amountCents / 100,
    })),
    deviceCharges: totalBaseCents / 100,
    extraPlayersTotal,
    trackedHours,
  };
}
