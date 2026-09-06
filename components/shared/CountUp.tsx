"use client";

import { useCountUp } from "@/lib/hooks/useCountUp";

interface CountUpProps {
  end: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  separator?: boolean; // Whether to use thousand separators
}

export function CountUp({
  end,
  duration = 1000,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
  separator = false
}: CountUpProps) {
  const count = useCountUp({ end, duration, decimals });

  const formatNumber = (num: string) => {
    if (!separator) return num;

    const parts = num.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  return (
    <span className={className}>
      {prefix}{formatNumber(count)}{suffix}
    </span>
  );
}

// Specialized component for currency
export function CurrencyCountUp({
  amount,
  duration = 1000,
  className = ""
}: {
  amount: number;
  duration?: number;
  className?: string;
}) {
  // Round to 2 decimals to avoid floating point precision issues
  const roundedAmount = Math.round(amount * 100) / 100;

  return (
    <CountUp
      end={roundedAmount}
      duration={duration}
      decimals={2}
      prefix="₹"
      separator={true}
      className={className}
    />
  );
}
