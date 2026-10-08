/** Customer-facing rate label for FI Simulator's hourly database rate. */
export function deviceRateLabel(deviceTypeName: string, hourlyRate: number): string {
  if (deviceTypeName.trim().toLowerCase() === 'fi simulator') {
    return `₹${(hourlyRate / 6).toLocaleString('en-IN')} / 10 min`
  }

  return `₹${hourlyRate.toLocaleString('en-IN')} / hour`
}
