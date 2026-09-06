import { useEffect, useState } from 'react';

interface UseCountUpOptions {
  end: number;
  duration?: number; // Duration in milliseconds
  decimals?: number; // Number of decimal places
  start?: number; // Starting value
}

export function useCountUp({
  end,
  duration = 1000,
  decimals = 0,
  start = 0
}: UseCountUpOptions) {
  const [count, setCount] = useState(start);

  useEffect(() => {
    if (end === start) {
      setCount(end);
      return;
    }

    const startTime = Date.now();
    const difference = end - start;

    const updateCount = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation (easeOutExpo)
      const easedProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

      const currentCount = start + (difference * easedProgress);
      setCount(currentCount);

      if (progress < 1) {
        requestAnimationFrame(updateCount);
      } else {
        setCount(end);
      }
    };

    const animation = requestAnimationFrame(updateCount);

    return () => cancelAnimationFrame(animation);
  }, [end, start, duration]);

  return decimals > 0 ? count.toFixed(decimals) : Math.floor(count).toString();
}
