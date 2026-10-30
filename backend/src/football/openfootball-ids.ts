import { createHash } from "node:crypto";

/** Stable, human-debuggable slug for a team name (used to derive external IDs). */
export function slugifyTeamName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * OpenFootball sometimes suffixes team names with a country code in
 * parentheses (Champions League txt format: "Real Madrid CF (ESP)"), while
 * the domestic-league JSON format does not ("Real Madrid CF"). Strip the
 * suffix so the same club resolves to the same team row everywhere.
 */
export function normalizeTeamName(rawName: string): string {
  return rawName.replace(/\s*\([A-Z]{2,4}\)\s*$/, "").trim();
}

export function teamExternalId(rawName: string): string {
  return `off:team:${slugifyTeamName(normalizeTeamName(rawName))}`;
}

/**
 * Deterministic match external ID, derived from stable inputs rather than
 * any upstream-assigned ID (OpenFootball doesn't provide one) — and
 * deliberately NOT from the kickoff date. OpenFootball's data is refreshed
 * daily and fixture dates for not-yet-played matches do get corrected
 * upstream (confirmed in testing: several December/January Premier League
 * fixtures shifted by a day between two sync runs on different days). Using
 * date in the key would silently create a duplicate row every time that
 * happens instead of updating the existing one. `round` is stable instead —
 * in a standard round-robin league season a given team pair plays at most
 * once per round, and for two-legged knockout ties the home/away pairing
 * itself already disambiguates leg 1 from leg 2.
 */
export function deterministicMatchExternalId(input: {
  source: string;
  seasonExternalId: string;
  competitionCode: string;
  round: string;
  homeTeamName: string;
  awayTeamName: string;
}): string {
  const key = [
    input.source,
    input.seasonExternalId,
    input.competitionCode,
    input.round,
    slugifyTeamName(normalizeTeamName(input.homeTeamName)),
    slugifyTeamName(normalizeTeamName(input.awayTeamName)),
  ].join("|");
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 16);
  return `off:match:${hash}`;
}

/**
 * Converts a local wall-clock date+time in a given IANA timezone to a UTC
 * Date. OpenFootball gives kickoff times in the host country's local time
 * with no explicit UTC offset, so we resolve the correct offset (including
 * DST) for that specific date using Intl, rather than assuming a fixed
 * offset that would be wrong for half the season.
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  // Initial guess: treat the wall-clock time as if it were UTC.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Ask what that instant looks like in the target timezone, then correct
  // for the difference — standard technique for zoned-wall-time -> UTC
  // without a timezone database library.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(guess).map((p) => [p.type, p.value]));
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute)
  );
  const offsetMs = guess.getTime() - asIfUtc;
  return new Date(guess.getTime() + offsetMs);
}

/** IANA timezone for each supported domestic league / competition, used to resolve kickoff times. */
export const COMPETITION_TIMEZONE: Record<string, string> = {
  "en.1": "Europe/London",
  "es.1": "Europe/Madrid",
  "it.1": "Europe/Rome",
  "de.1": "Europe/Berlin",
  "fr.1": "Europe/Paris",
  cl: "Europe/Paris", // UEFA competitions run on Central European time
};
