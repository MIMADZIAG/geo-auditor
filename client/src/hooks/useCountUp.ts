/**
 * useCountUp — animates a number from `from` to `target` over `duration` ms.
 *
 * Design decisions (Perplexity/Profound engineering standard):
 * - Uses requestAnimationFrame for GPU-composited, jank-free animation.
 * - Ease-out cubic: fast start, slow finish — creates the "settling" feel that
 *   makes a score reveal feel weighty and trustworthy.
 * - `enabled` gate: animation only starts once the caller is ready (e.g., after
 *   a 400ms delay post-completion). Prevents premature animation on remounts.
 * - Stable ref pattern: avoids stale closure bugs in the rAF callback.
 * - Cleanup: always cancels the pending frame on unmount or when deps change.
 */

import { useEffect, useRef, useState } from "react";

interface UseCountUpOptions {
  /** Target value to animate to */
  target: number;
  /** Starting value (default: 0) */
  from?: number;
  /** Animation duration in milliseconds (default: 1200) */
  duration?: number;
  /** Whether to start the animation (default: true) */
  enabled?: boolean;
  /** Delay in ms before animation starts (default: 0) */
  delay?: number;
}

/**
 * Cubic ease-out: t ∈ [0,1] → value ∈ [0,1]
 * Fast at start, decelerates toward end — ideal for score reveals.
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useCountUp({
  target,
  from = 0,
  duration = 1200,
  enabled = true,
  delay = 0,
}: UseCountUpOptions): { value: number; isComplete: boolean } {
  const [value, setValue] = useState(from);
  const [isComplete, setIsComplete] = useState(false);

  // Stable refs to avoid stale closures in rAF
  const rafRef = useRef<number | null>(null);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setValue(from);
      setIsComplete(false);
      return;
    }

    // Reset state when target changes
    setValue(from);
    setIsComplete(false);
    startTimeRef.current = null;

    // Cancel any pending animation
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (delayTimerRef.current !== null) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }

    // If target equals from, skip animation
    if (target === from) {
      setValue(target);
      setIsComplete(true);
      return;
    }

    const startAnimation = () => {
      const animate = (timestamp: number) => {
        if (startTimeRef.current === null) {
          startTimeRef.current = timestamp;
        }

        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutCubic(progress);
        const current = from + (target - from) * easedProgress;

        // For integer targets (like 0→4), round to nearest integer
        // For float targets, keep 1 decimal place
        const rounded = Number.isInteger(target) && Number.isInteger(from)
          ? Math.round(current)
          : Math.round(current * 10) / 10;

        setValue(rounded);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          setValue(target);
          setIsComplete(true);
          rafRef.current = null;
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    };

    if (delay > 0) {
      delayTimerRef.current = setTimeout(startAnimation, delay);
    } else {
      startAnimation();
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (delayTimerRef.current !== null) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
    };
  }, [target, from, duration, enabled, delay]);

  return { value, isComplete };
}
