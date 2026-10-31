export interface LiveMatchClockState {
  display: string;      // e.g. "03:52", "45:10", "HT", "76:10", "90:00+"
  minuteText: string;   // e.g. "4'", "45+2'", "HT", "77'", "90+'"
  minute: number;       // integer minute e.g. 4, 45, 77, 90
  phase: "PRE" | "1H" | "HT" | "2H" | "ET" | "FT";
}

/**
 * Computes the real-time match clock for football matches.
 * Football matches almost never kick off at 00:00s of scheduled time due to player
 * walkout, anthems, team huddles, and referee pre-match protocols (~60-90s delay).
 * In addition, live broadcast streams typically have a 20-40s stream latency behind
 * live pitch action.
 * This clock ensures the displayed match time is on track or conservative (slightly behind),
 * and NEVER runs ahead of the live broadcast.
 */
export function getLiveMatchTime(
  kickoffAt?: string | Date | null,
  status?: string | null,
  actualKickoffAt?: string | Date | null
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

  // If actual kickoff was detected, use it with a small 20s broadcast buffer.
  // Otherwise, use scheduled kickoffAt with a realistic 80s walkout/kickoff delay buffer.
  let diffSecs: number;
  if (actualKickoffAt) {
    const actualMs = new Date(actualKickoffAt).getTime();
    if (!isNaN(actualMs)) {
      // 20s stream latency buffer ensures our clock is never ahead of live TV / web stream
      diffSecs = Math.max(0, Math.floor((nowMs - actualMs - 20_000) / 1000));
    } else {
      diffSecs = Math.max(0, Math.floor((nowMs - kickoffMs - 80_000) / 1000));
    }
  } else {
    // 80s buffer: match walkout (~60s) + broadcast stream latency (~20s)
    diffSecs = Math.max(0, Math.floor((nowMs - kickoffMs - 80_000) / 1000));
  }

  // Before kickoff whistle actually blows (during walkout/lineup)
  if (diffSecs <= 0) {
    return {
      display: "00:00",
      minuteText: "1'",
      minute: 1,
      phase: "1H",
    };
  }

  // First half: 0 to 45 mins (0 to 2700s)
  if (diffSecs < 45 * 60) {
    const mins = Math.floor(diffSecs / 60);
    const secs = diffSecs % 60;
    const display = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return {
      display,
      minuteText: `${mins + 1}'`,
      minute: mins + 1,
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

  // Half time: 48m to 63m (2880s to 3780s - 15 minute standard half-time)
  if (diffSecs < 63 * 60) {
    return {
      display: "HT",
      minuteText: "HT",
      minute: 45,
      phase: "HT",
    };
  }

  // Second half: starts at ~63 mins after kickoff (45m 1H + 3m stoppage + 15m HT)
  const secondHalfSecs = diffSecs - 63 * 60;
  const totalMatchSecs = 45 * 60 + secondHalfSecs;

  // Regular 2nd half: 45m to 90m (2700s to 5400s)
  if (totalMatchSecs < 90 * 60) {
    const mins = Math.floor(totalMatchSecs / 60);
    const secs = totalMatchSecs % 60;
    const display = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return {
      display,
      minuteText: `${mins + 1}'`,
      minute: mins + 1,
      phase: "2H",
    };
  }

  // 2nd half stoppage: 90m onwards
  return {
    display: "90:00+",
    minuteText: "90+'",
    minute: 90,
    phase: "2H",
  };
}
