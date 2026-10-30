import { useState, useEffect } from "react";
import { getLiveMatchTime, type LiveMatchClockState } from "../lib/live-clock";

/**
 * Custom React hook to maintain a real-time live football match clock.
 * Updates every second when a match is currently "LIVE".
 */
export function useLiveMatchClock(
  kickoffAt?: string | Date | null,
  status?: string | null
): LiveMatchClockState {
  const [clock, setClock] = useState<LiveMatchClockState>(() =>
    getLiveMatchTime(kickoffAt, status)
  );

  useEffect(() => {
    // Initial evaluation
    setClock(getLiveMatchTime(kickoffAt, status));

    // Only tick continuously if the match is currently LIVE
    if (status !== "LIVE") return;

    const interval = setInterval(() => {
      setClock(getLiveMatchTime(kickoffAt, status));
    }, 1000);

    return () => clearInterval(interval);
  }, [kickoffAt, status]);

  return clock;
}
