import { useState, useEffect, useCallback } from 'react';
import { getActiveHappyHours } from '@/app/(customer)/booking/happy-hours-actions';
import { HappyHourRule, findApplicableHappyHour, calculateHappyHourDiscount } from '@/lib/happy-hours';

export function useHappyHours() {
  const [rules, setRules] = useState<HappyHourRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const result = await getActiveHappyHours();
      if (result.success) {
        setRules(result.rules);
      } else {
        console.error('Failed to load happy hours:', result.error);
      }
    } catch (error) {
      console.error('Error loading happy hours:', error);
      // Silently fail - happy hours are optional, booking should still work
    } finally {
      setLoading(false);
    }
  };

  /**
   * Both helpers are memoised because callers put them in `useMemo` dependency
   * lists. A fresh identity on every render made those memos recompute on every
   * render - including the slot picker's per-slot happy-hour lookup, which is
   * the one caller that runs this against every half hour of the day.
   */
  const checkHappyHour = useCallback((
    deviceType: string,
    bookingDate: Date,
    slotStartTime: string,
    slotEndTime: string
  ): { rule: HappyHourRule | null; discount: number } => {
    const rule = findApplicableHappyHour(rules, deviceType, bookingDate, slotStartTime, slotEndTime);
    return { rule, discount: rule ? rule.discount : 0 };
  }, [rules]);

  const calculateDiscount = useCallback((baseAmount: number, discountPercentage: number): number => {
    return calculateHappyHourDiscount(baseAmount, discountPercentage);
  }, []);

  return {
    rules,
    loading,
    checkHappyHour,
    calculateDiscount,
    hasActiveRules: rules.length > 0
  };
}
