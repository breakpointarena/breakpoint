/**
 * Round amount to 2 decimal places to avoid floating point precision issues
 */
export function roundToTwo(amount: number | string): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;

  // Handle NaN and invalid numbers
  if (isNaN(num)) return 0;

  // Round to 2 decimal places
  return Math.round(num * 100) / 100;
}

/**
 * Format currency amount to 2 decimal places with Indian locale
 * Handles floating point precision issues
 */
export function formatCurrency(amount: number | string): string {
  const rounded = roundToTwo(amount);

  return rounded.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Format currency with rupee symbol
 */
export function formatCurrencyWithSymbol(amount: number | string): string {
  return `₹${formatCurrency(amount)}`;
}
