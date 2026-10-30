// OpenFootball's Champions League repo ships data in the "Football.TXT"
// format, not JSON — this is NOT the same schema as football.json, so it
// gets its own parser (per the brief: don't assume the two repos match).
//
// Example (verified against the live 2025-26 dataset:
// https://raw.githubusercontent.com/openfootball/champions-league/master/2025-26/cl.txt):
//
//   = UEFA Champions League 2025/26
//
//   # Date       Tue Sep 16 2025 - Sat May 30 2026 (256d)
//   ...
//
//   ▪ League, Matchday 1
//     Tue Sep 16 2025
//       18:45  Athletic Club (ESP)     v Arsenal FC (ENG)         0-2 (0-0)
//              PSV (NED)               v Royale Union Saint-Gilloise (BEL)  1-3 (0-2)
//     Wed Sep 17
//       21:00  AFC Ajax (NED)          v FC Internazionale Milano (ITA)  0-2 (0-1)
//
// A match line either starts with an explicit "HH:MM" kickoff time, or (for
// matches kicking off at the same time as the previous line) omits the time
// and is indented to line up under it instead.

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export type ParsedTxtMatch = {
  round: string; // e.g. "League, Matchday 1" or "Finals, Final"
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  team1: string;
  team2: string;
  finished: boolean;
  homeScore: number | null;
  awayScore: number | null;
  wentToExtraTime: boolean;
  wentToPenalties: boolean;
  homePenalties: number | null;
  awayPenalties: number | null;
};

export type ParsedTxtDataset = {
  name: string;
  matches: ParsedTxtMatch[];
};

const DATE_LINE = /^\s{2,}([A-Za-z]{3})[a-z]*\s+([A-Za-z]{3})[a-z]*\s+(\d{1,2})(?:\s+(\d{4}))?\s*$/;
const TIME_MATCH_LINE = /^\s{2,}(\d{1,2}:\d{2})\s+(.+)$/;
const CONTINUATION_LINE = /^\s{6,}(\S.*\sv\s.*)$/;

// Score tail: [pens H-A "pen."] mainH-mainA [" a.e.t."] [ "(" ... ")" ]
const SCORE_RE = /^(?:(\d+)-(\d+)\s+pen\.\s+)?(\d+)-(\d+)(\s+a\.e\.t\.)?(?:\s*\([^)]*\))?\s*$/;

function parseMatchContent(content: string): {
  team1: string;
  team2: string;
  finished: boolean;
  homeScore: number | null;
  awayScore: number | null;
  wentToExtraTime: boolean;
  wentToPenalties: boolean;
  homePenalties: number | null;
  awayPenalties: number | null;
} | null {
  const vIndex = content.indexOf(" v ");
  if (vIndex === -1) return null;

  const team1Raw = content.slice(0, vIndex).trim();
  const rest = content.slice(vIndex + 3);

  // Split "Team2 <2+ spaces> score..." — team2 has no score if the match
  // hasn't been played yet, in which case the whole remainder is the name.
  const scoreSplit = rest.match(/^(.+?)\s{2,}(\S.*)$/);

  let team2Raw: string;
  let scoreText: string | null;
  if (scoreSplit) {
    team2Raw = scoreSplit[1].trim();
    scoreText = scoreSplit[2].trim();
  } else {
    team2Raw = rest.trim();
    scoreText = null;
  }

  if (!scoreText) {
    return {
      team1: team1Raw,
      team2: team2Raw,
      finished: false,
      homeScore: null,
      awayScore: null,
      wentToExtraTime: false,
      wentToPenalties: false,
      homePenalties: null,
      awayPenalties: null,
    };
  }

  const scoreMatch = scoreText.match(SCORE_RE);
  if (!scoreMatch) {
    // Unrecognized trailing content (e.g. a note we don't handle) — treat
    // defensively as unplayed rather than guessing at a score.
    return {
      team1: team1Raw,
      team2: team2Raw,
      finished: false,
      homeScore: null,
      awayScore: null,
      wentToExtraTime: false,
      wentToPenalties: false,
      homePenalties: null,
      awayPenalties: null,
    };
  }

  const [, penHome, penAway, home, away, aet] = scoreMatch;
  return {
    team1: team1Raw,
    team2: team2Raw,
    finished: true,
    homeScore: Number(home),
    awayScore: Number(away),
    wentToExtraTime: !!aet || penHome !== undefined,
    wentToPenalties: penHome !== undefined,
    homePenalties: penHome !== undefined ? Number(penHome) : null,
    awayPenalties: penAway !== undefined ? Number(penAway) : null,
  };
}

export function parseFootballTxt(raw: string): ParsedTxtDataset {
  const lines = raw.split("\n");
  let name = "";
  let currentRound = "";
  let currentDate: string | null = null;
  let currentYear: number | null = null;
  let currentTime: string | null = null;
  const matches: ParsedTxtMatch[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    if (line.startsWith("=")) {
      name = line.slice(1).trim();
      continue;
    }
    if (line.startsWith("#")) continue;

    if (line.trimStart().startsWith("▪")) {
      currentRound = line.replace("▪", "").trim();
      continue;
    }

    const dateMatch = line.match(DATE_LINE);
    if (dateMatch) {
      const [, , monthAbbr, dayStr, yearStr] = dateMatch;
      const month = MONTHS[monthAbbr.toLowerCase()];
      if (month === undefined) continue; // unrecognized month token, skip defensively
      if (yearStr) currentYear = Number(yearStr);
      if (currentYear === null) continue; // no year established yet — can't date this line
      const day = Number(dayStr);
      currentDate = `${currentYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      continue;
    }

    const timeMatch = line.match(TIME_MATCH_LINE);
    if (timeMatch) {
      currentTime = timeMatch[1];
      const parsed = parseMatchContent(timeMatch[2]);
      if (parsed && currentDate && currentTime) {
        matches.push({ round: currentRound, date: currentDate, time: currentTime, ...parsed });
      }
      continue;
    }

    const contMatch = line.match(CONTINUATION_LINE);
    if (contMatch && currentTime && currentDate) {
      const parsed = parseMatchContent(contMatch[1]);
      if (parsed) {
        matches.push({ round: currentRound, date: currentDate, time: currentTime, ...parsed });
      }
      continue;
    }
    // Any other line (stray notes, blank separators) is skipped deliberately
    // rather than guessed at.
  }

  return { name, matches };
}
