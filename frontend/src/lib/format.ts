export function formatKickoff(iso: string, timeConfirmed: boolean = true): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const dateLabel = isToday
    ? "Today"
    : (() => {
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
        return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      })();

  if (!timeConfirmed) return `${dateLabel} · time TBC`;

  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${dateLabel}, ${time}`;
}

export function countdown(iso: string): string | null {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return null;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

export function teamInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 3)
    .join("")
    .toUpperCase();
}

export function playerInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    // Only one name (no surname) -> one letter of first name
    return parts[0][0].toUpperCase();
  }
  // First letter of first name + first letter of last name (e.g. "Abdel Abqar" -> "AA")
  const first = parts[0][0];
  const last = parts[parts.length - 1][0];
  return `${first}${last}`.toUpperCase();
}

export function statusLabel(status: string): string {
  switch (status) {
    case "SCHEDULED": return "Upcoming";
    case "LIVE": return "Live";
    case "FINISHED": return "Full-time";
    case "POSTPONED": return "Postponed";
    case "CANCELLED": return "Cancelled";
    default: return status;
  }
}

export function isMatchCalendarDay(kickoffAt: string | Date, referenceDate: Date = new Date()): boolean {
  const matchDate = new Date(kickoffAt);
  if (isNaN(matchDate.getTime())) return false;
  const matchUtc = matchDate.toISOString().slice(0, 10);
  const refUtc = referenceDate.toISOString().slice(0, 10);
  if (matchUtc === refUtc) return true;
  return matchDate.toDateString() === referenceDate.toDateString();
}

export function canRecordWatch(match: { status: string; kickoffAt: string | Date }, referenceDate: Date = new Date()): boolean {
  if (match.status === "FINISHED" || match.status === "LIVE" || match.status === "PAUSED") return true;
  const kickoffMs = new Date(match.kickoffAt).getTime();
  return !isNaN(kickoffMs) && kickoffMs <= referenceDate.getTime();
}

export function formatPosition(position?: string | null): string {
  if (!position) return "";
  const p = position.trim();
  if (p.toLowerCase() === "offence") return "Attack";
  if (p.toUpperCase() === "SUB" || p.toLowerCase() === "substitute") return "Midfield";
  return p;
}

export function formatDateTimeline(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatRound(round?: string | null): string {
  if (!round) return "";
  // Replace underscores with spaces
  return round
    .replace(/_/g, " ")
    .replace(/\b[A-Z]{2,}\b/g, (word) => {
      if (word === "UEFA" || word === "FC" || word === "VAR" || word === "POTM") return word;
      return word.charAt(0) + word.slice(1).toLowerCase();
    })
    .replace(/\b(of|the|and|in|de|la)\b/gi, (match, _, offset) => {
      return offset === 0 ? match.charAt(0).toUpperCase() + match.slice(1).toLowerCase() : match.toLowerCase();
    });
}

export function formatMatchMinuteNumber(minute?: number | string | null, wentToExtraTime: boolean = false): string {
  if (minute === null || minute === undefined) return "";
  const str = String(minute).trim().replace(/'/g, "");
  if (!str) return "";
  if (str.includes("+")) return str;
  const num = parseInt(str, 10);
  if (isNaN(num)) return str;
  if (wentToExtraTime) {
    if (num > 120) return `120+${num - 120}`;
    return `${num}`;
  }
  if (num > 90) {
    return `90+${num - 90}`;
  }
  return `${num}`;
}

export function formatMatchMinute(minute?: number | string | null, wentToExtraTime: boolean = false): string {
  const numStr = formatMatchMinuteNumber(minute, wentToExtraTime);
  if (!numStr) return "";
  return `${numStr}'`;
}




