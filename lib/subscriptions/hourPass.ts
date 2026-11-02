import { round2 } from "@/lib/payments/money";

export function isHourPackEligibleForDevice(
  packDeviceTypeId: string | null,
  bookingDeviceTypeId: string | null
): boolean {
  return packDeviceTypeId === null ||
    (bookingDeviceTypeId !== null && packDeviceTypeId === bookingDeviceTypeId);
}

export interface HourPassRedemption {
  minutesUsed: number;
  amountCovered: number;
}

/** Covers only the enrolled player's proportional share of device charges. */
export function calculateHourPassRedemption(
  playedMinutes: number,
  availableMinutes: number,
  playerShare: number,
  shareableAmount: number
): HourPassRedemption {
  const minutes = Math.max(0, Math.ceil(playedMinutes));
  const used = Math.min(minutes, Math.max(0, Math.floor(availableMinutes)));
  const share = Math.max(0, Number(playerShare) || 0);
  const eligible = Math.max(0, Number(shareableAmount) || 0);

  if (minutes === 0 || used === 0 || share === 0 || eligible === 0) {
    return { minutesUsed: used, amountCovered: 0 };
  }

  return {
    minutesUsed: used,
    amountCovered: round2(Math.min(share, eligible) * (used / minutes)),
  };
}
