export interface LiveMatchClockState {
  display: string;      // e.g. "76:10", "34:20", "HT", "90:00+"
  minuteText: string;   // e.g. "76'", "HT", "90+3'"
  minute: number;       // integer minute e.g. 76, 45, 90
  phase: "PRE" | "1H" | "HT" | "2H" | "ET" | "FT";
}

/**
 * Computes the real-time match clock for football matches.
 * Standard football timing:
 * - 0m to 45m: First Half (00:00 to 45:00)
 * - 45m to ~48m: 1st Half Stoppage Time (45:00+)
 * - ~48m to ~60m: Half-Time break (HT)
 * - ~60m to ~105m: Second Half (45:00 to 90:00, ticking continuously, e.g. 76:10)
 * - >105m: 2nd Half Stoppage Time (90:00+)
 */
export function getLiveMatchTime(
  kickoffAt?: string | Date | null,
  status?: string | null
): LiveMatchClockState {
  if (!kickoffAt || !status) {
    return { display: "", minuteText: "", minute: 0, phase: "PRE" };
  }

  if (status === "PAUSED") {
    return { display: "HT", minuteText: "HT", minute: 45, phase: "HT" };
  }

  if (status === "FINISHED") {
    return { display: "FT", minuteText: "FT", minute: 90, phase: "FT" };
  }

  if (status !== "LIVE") {
    return { display: "", minuteText: "", minute: 0, phase: "PRE" };
  }

  const kickoffMs = new Date(kickoffAt).getTime();
  if (isNaN(kickoffMs)) {
    return { display: "00:00", minuteText: "1'", minute: 1, phase: "1H" };
  }

  const nowMs = Date.now();
  const diffSecs = Math.max(0, Math.floor((nowMs - kickoffMs) / 1000));

  // First half: 0 to 45 mins (0 to 2700s)
  if (diffSecs < 45 * 60) {
    const mins = Math.floor(diffSecs / 60);
    const secs = diffSecs % 60;
    const display = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return {
      display,
      minuteText: `${mins}'`,
      minute: mins,
      phase: "1H",
    };
  }

  // 1st half stoppage: 45m to 48m (2700s to 2880s)
  if (diffSecs <= 48 * 60) {
    const extraSecs = diffSecs - 45 * 60;
    const extraMins = Math.floor(extraSecs / 60);
    const display = `45:${String(extraSecs % 60).padStart(2, "0")}`;
    return {
      display,
      minuteText: `45+${extraMins + 1}'`,
      minute: 45,
      phase: "1H",
    };
  }

  // Half time: 48m to 60m (2880s to 3600s)
  if (diffSecs < 60 * 60) {
    return {
      display: "HT",
      minuteText: "HT",
      minute: 45,
      phase: "HT",
    };
  }

  // Second half: starts at 60 mins after kickoff
  const secondHalfSecs = diffSecs - 60 * 60;
  const totalMatchSecs = 45 * 60 + secondHalfSecs;

  // Regular 2nd half: 45m to 90m (2700s to 5400s)
  if (totalMatchSecs < 90 * 60) {
    const mins = Math.floor(totalMatchSecs / 60);
    const secs = totalMatchSecs % 60;
    const display = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return {
      display,
      minuteText: `${mins}'`,
      minute: mins,
      phase: "2H",
    };
  }

  // 2nd half stoppage: 90m onwards
  const stoppageSecs = Math.min(15 * 60, totalMatchSecs - 90 * 60);
  const stoppageMins = Math.floor(stoppageSecs / 60);
  const display = `90:${String(stoppageSecs % 60).padStart(2, "0")}`;
  return {
    display,
    minuteText: `90+${stoppageMins + 1}'`,
    minute: 90,
    phase: "2H",
  };
}
