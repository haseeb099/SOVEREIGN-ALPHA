"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RetryState = {
  isRetrying: boolean;
  attempt: number;
  nextRetryInMs: number | null;
};

export function useRetryWithBackoff(
  fn: () => Promise<void>,
  options?: {
    enabled?: boolean;
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  },
) {
  const {
    enabled = true,
    maxAttempts = 5,
    baseDelayMs = 2000,
    maxDelayMs = 30_000,
  } = options ?? {};

  const fnRef = useRef(fn);
  fnRef.current = fn;

  const [state, setState] = useState<RetryState>({
    isRetrying: false,
    attempt: 0,
    nextRetryInMs: null,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(
    (attempt: number) => {
      if (!enabled || attempt >= maxAttempts || cancelledRef.current) {
        setState((s) => ({ ...s, isRetrying: false, nextRetryInMs: null }));
        return;
      }

      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      setState({ isRetrying: true, attempt: attempt + 1, nextRetryInMs: delay });

      timerRef.current = setTimeout(async () => {
        if (cancelledRef.current) return;
        try {
          await fnRef.current();
          setState({ isRetrying: false, attempt: 0, nextRetryInMs: null });
        } catch {
          scheduleRetry(attempt + 1);
        }
      }, delay);
    },
    [enabled, maxAttempts, baseDelayMs, maxDelayMs],
  );

  const retry = useCallback(() => {
    clearTimer();
    cancelledRef.current = false;
    setState({ isRetrying: true, attempt: 1, nextRetryInMs: null });
    void fnRef.current()
      .then(() => {
        setState({ isRetrying: false, attempt: 0, nextRetryInMs: null });
      })
      .catch(() => {
        scheduleRetry(0);
      });
  }, [clearTimer, scheduleRetry]);

  const startAutoRetry = useCallback(() => {
    cancelledRef.current = false;
    scheduleRetry(0);
  }, [scheduleRetry]);

  const stopAutoRetry = useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    setState((s) => ({ ...s, isRetrying: false, nextRetryInMs: null }));
  }, [clearTimer]);

  useEffect(() => () => {
    cancelledRef.current = true;
    clearTimer();
  }, [clearTimer]);

  return { ...state, retry, startAutoRetry, stopAutoRetry };
}
