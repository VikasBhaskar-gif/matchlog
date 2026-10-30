import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useMatchPotm } from "../hooks/queries";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatPosition, playerInitials, formatMatchMinute } from "../lib/format";
import type { PotmCandidate } from "../api/types";

function getPositionCategory(p?: PotmCandidate | string | null): "ATT" | "MID" | "DEF" | "GK" | "OTHER" {
  if (!p) return "OTHER";
  const text = typeof p === "string" ? p.toLowerCase() : `${p.tacticalPosition || ""} ${p.position || ""}`.toLowerCase();
  if (text.includes("goal") || text.includes("keeper") || text === "g" || text === "gk") return "GK";
  if (text.includes("def") || text.includes("back") || text === "d" || text === "df" || text.includes("cd") || text.includes("cb")) return "DEF";
  if (text.includes("mid") || text === "m" || text === "mf" || text.includes("cm") || text.includes("dm")) return "MID";
  if (
    text.includes("offence") ||
    text.includes("attack") ||
    text.includes("forward") ||
    text.includes("striker") ||
    text.includes("winger") ||
    text === "f" ||
    text === "fw" ||
    text.includes("lf") ||
    text.includes("rf") ||
    text.includes("lw") ||
    text.includes("rw") ||
    text.includes("cf")
  ) {
    return "ATT";
  }
  return "OTHER";
}

function getKnownPlayerProfile(name: string) {
  const n = (name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  // Left Flank / Left Wingers / Left Backs (rank 10)
  if (n.includes("vinicius") || n.includes("junior")) return { rank: 10, preferredLine: "ATT_MID" as const };
  if (n.includes("adeyemi")) return { rank: 10, preferredLine: "ATT_MID" as const };
  if (n.includes("kvaratskhelia")) return { rank: 10, preferredLine: "ATT_MID" as const };
  if (n.includes("barcola")) return { rank: 10, preferredLine: "ATT_MID" as const };
  if (n.includes("martinelli")) return { rank: 10, preferredLine: "ATT_MID" as const };
  if (n.includes("luis diaz")) return { rank: 10, preferredLine: "ATT_MID" as const };
  if (n.includes("gordon")) return { rank: 10, preferredLine: "ATT_MID" as const };
  if (n.includes("cucurella")) return { rank: 10, preferredLine: "DEF" as const };
  if (n.includes("balde")) return { rank: 10, preferredLine: "DEF" as const };
  if (n.includes("nuno mendes")) return { rank: 10, preferredLine: "DEF" as const };
  if (n.includes("gerard martin")) return { rank: 10, preferredLine: "DEF" as const };
  if (n.includes("lucas hernandez")) return { rank: 10, preferredLine: "DEF" as const };
  if (n.includes("robertson")) return { rank: 10, preferredLine: "DEF" as const };
  if (n.includes("calafiori")) return { rank: 10, preferredLine: "DEF" as const };

  // Right Flank / Right Wingers / Right Backs (rank 90)
  if (n.includes("yamal")) return { rank: 90, preferredLine: "ATT_MID" as const };
  if (n.includes("saka")) return { rank: 90, preferredLine: "ATT_MID" as const };
  if (n.includes("salah")) return { rank: 90, preferredLine: "ATT_MID" as const };
  if (n.includes("rodrygo")) return { rank: 90, preferredLine: "ATT_MID" as const };
  if (n.includes("diomande") || n.includes("diamonde")) return { rank: 90, preferredLine: "ATT_MID" as const };
  if (n.includes("guler")) return { rank: 90, preferredLine: "ATT_MID" as const };
  if (n.includes("doue")) return { rank: 90, preferredLine: "ATT_MID" as const };
  if (n.includes("hakimi")) return { rank: 90, preferredLine: "DEF" as const };
  if (n.includes("carvajal")) return { rank: 90, preferredLine: "DEF" as const };
  if (n.includes("kounde")) return { rank: 90, preferredLine: "DEF" as const };
  if (n.includes("dumfries")) return { rank: 90, preferredLine: "DEF" as const };
  if (n.includes("alexander-arnold")) return { rank: 90, preferredLine: "DEF" as const };
  if (n.includes("espart")) return { rank: 90, preferredLine: "DEF" as const };

  // Center / CAM / Striker / Central Players (rank 50)
  if (n.includes("bellingham")) return { rank: 50, preferredLine: "ATT_MID" as const };
  if (n.includes("kang-in") || n.includes("kang in")) return { rank: 70, preferredLine: "ATT_MID" as const };
  if (n.includes("baena")) return { rank: 30, preferredLine: "ATT_MID" as const };
  if (n.includes("fermin")) return { rank: 50, preferredLine: "ATT_MID" as const };
  if (n.includes("dani olmo") || n.includes("olmo")) return { rank: 50, preferredLine: "ATT_MID" as const };
  if (n.includes("de bruyne")) return { rank: 50, preferredLine: "ATT_MID" as const };
  if (n.includes("odegaard")) return { rank: 50, preferredLine: "ATT_MID" as const };
  if (n.includes("palmer")) return { rank: 70, preferredLine: "ATT_MID" as const };
  if (n.includes("foden")) return { rank: 60, preferredLine: "ATT_MID" as const };

  if (n.includes("mbappe")) return { rank: 50, preferredLine: "FWD" as const };
  if (n.includes("haaland")) return { rank: 50, preferredLine: "FWD" as const };
  if (n.includes("lewandowski")) return { rank: 50, preferredLine: "FWD" as const };
  if (n.includes("gabriel jesus")) return { rank: 50, preferredLine: "FWD" as const };
  if (n.includes("jonathan david")) return { rank: 40, preferredLine: "FWD" as const };
  if (n.includes("griezmann")) return { rank: 60, preferredLine: "FWD" as const };
  if (n.includes("julian alvarez")) return { rank: 50, preferredLine: "FWD" as const };
  if (n.includes("sorloth")) return { rank: 50, preferredLine: "FWD" as const };
  if (n.includes("dembele")) return { rank: 50, preferredLine: "FWD" as const };
  if (n.includes("raphinha")) return { rank: 10, preferredLine: "ATT_MID" as const };

  if (n.includes("koke")) return { rank: 45, preferredLine: "DEF_MID" as const };
  if (n.includes("de paul")) return { rank: 65, preferredLine: "DEF_MID" as const };
  if (n.includes("tchouameni")) return { rank: 35, preferredLine: "DEF_MID" as const };
  if (n.includes("camavinga")) return { rank: 40, preferredLine: "DEF_MID" as const };
  if (n.includes("valverde")) return { rank: 65, preferredLine: "DEF_MID" as const };
  if (n.includes("pedri")) return { rank: 35, preferredLine: "DEF_MID" as const };
  if (n.includes("rodri")) return { rank: 50, preferredLine: "DEF_MID" as const };
  if (n.includes("vitinha")) return { rank: 50, preferredLine: "DEF_MID" as const };
  if (n.includes("ruiz")) return { rank: 30, preferredLine: "DEF_MID" as const };
  if (n.includes("neves")) return { rank: 70, preferredLine: "DEF_MID" as const };

  if (n.includes("rudiger")) return { rank: 40, preferredLine: "DEF" as const };
  if (n.includes("konate")) return { rank: 60, preferredLine: "DEF" as const };
  if (n.includes("militao")) return { rank: 60, preferredLine: "DEF" as const };
  if (n.includes("cubarsi")) return { rank: 60, preferredLine: "DEF" as const };
  if (n.includes("marquinhos")) return { rank: 60, preferredLine: "DEF" as const };
  if (n.includes("pacho")) return { rank: 40, preferredLine: "DEF" as const };
  if (n.includes("saliba")) return { rank: 60, preferredLine: "DEF" as const };
  if (n.includes("cancelo")) return { rank: 35, preferredLine: "DEF" as const };

  // Goalkeepers - EXACT name or word boundary match! NEVER match "raya" inside "rayan"!
  if (
    n.includes("courtois") ||
    n.includes("ter stegen") ||
    n.includes("safonov") ||
    n.includes("donnarumma") ||
    (/\b(david raya|raya)\b/i.test(n) && !n.includes("rayan")) ||
    n.includes("alisson") ||
    n.includes("ederson") ||
    n.includes("lunin") ||
    n.includes("joan garcia") ||
    n.includes("henderson") ||
    n.includes("petrovic") ||
    n.includes("oblak")
  ) {
    return { rank: 50, preferredLine: "GK" as const };
  }

  return null;
}

function getDetailedTacticalLine(
  p: PotmCandidate,
  formation?: string | null
): "GK" | "DEF" | "DEF_MID" | "ATT_MID" | "FWD" {
  const fp = p.formationPlace;
  const tp = (p.tacticalPosition || "").toLowerCase().trim();
  const pos = (p.position || "").toLowerCase().trim();

  // 1. Formation Place based exact mapping (the highest priority official tactical data)
  if (fp && fp >= 1) {
    if (fp === 1) return "GK";

    if (formation?.includes("4-2-3-1")) {
      if (fp === 9) return "FWD";
      if ([7, 10, 11].includes(fp)) return "ATT_MID";
      if ([4, 8].includes(fp)) return "DEF_MID";
      if ([2, 3, 5, 6].includes(fp)) return "DEF";
    }

    if (formation?.includes("4-3-3")) {
      if ([9, 10, 11].includes(fp)) return "FWD";
      if ([4, 7, 8].includes(fp)) return "DEF_MID";
      if ([2, 3, 5, 6].includes(fp)) return "DEF";
    }

    if (formation?.includes("4-4-2")) {
      if ([9, 10].includes(fp)) return "FWD";
      if ([4, 7, 8, 11].includes(fp)) return "DEF_MID";
      if ([2, 3, 5, 6].includes(fp)) return "DEF";
    }

    if (formation?.includes("3-4-2-1")) {
      if (fp === 9) return "FWD";
      if ([10, 11].includes(fp)) return "ATT_MID";
      if ([2, 3, 7, 8].includes(fp)) return "DEF_MID";
      if ([4, 5, 6].includes(fp)) return "DEF";
    }

    if (formation?.includes("3-5-2")) {
      if ([9, 10].includes(fp)) return "FWD";
      if ([2, 3, 7, 8, 11].includes(fp)) return "DEF_MID";
      if ([4, 5, 6].includes(fp)) return "DEF";
    }

    if (formation?.includes("5-4-1")) {
      if (fp === 9) return "FWD";
      if ([7, 8, 10, 11].includes(fp)) return "DEF_MID";
      if ([2, 3, 4, 5, 6].includes(fp)) return "DEF";
    }

    if (formation?.includes("3-4-3")) {
      if ([9, 10, 11].includes(fp)) return "FWD";
      if ([2, 3, 7, 8].includes(fp)) return "DEF_MID";
      if ([4, 5, 6].includes(fp)) return "DEF";
    }
  }

  // 2. Tactical position text parsing
  const text = `${tp} ${pos}`;
  if (
    text.includes("goal") ||
    text.includes("keeper") ||
    /\b(g|gk)\b/i.test(tp) ||
    /\b(g|gk)\b/i.test(pos)
  ) {
    return "GK";
  }

  if (
    text.includes("back") ||
    text.includes("defender") ||
    text.includes("defence") ||
    text.includes("sweeper") ||
    /\b(cb|cd|lb|rb|lwb|rwb|df|d)\b/i.test(tp) ||
    /\b(cb|cd|lb|rb|lwb|rwb|df|d)\b/i.test(pos)
  ) {
    return "DEF";
  }

  if (tp === "forward" || tp === "striker" || /\b(st|cf)\b/i.test(tp)) {
    return "FWD";
  }

  if (
    text.includes("attacking midfielder") ||
    text.includes("center left forward") ||
    text.includes("center right forward") ||
    text.includes("am-l") ||
    text.includes("am-r") ||
    /\b(cam|lam|ram|am|lw|rw)\b/i.test(tp) ||
    /\b(cam|lam|ram|am|lw|rw)\b/i.test(pos)
  ) {
    if (formation?.includes("4-3-3")) return "FWD";
    return "ATT_MID";
  }

  // 3. Fallback to Known Player Profile if tactical position was generic
  const profile = getKnownPlayerProfile(p.name);
  if (profile?.preferredLine) {
    if (formation?.includes("4-3-3") && profile.preferredLine === "ATT_MID") {
      return "FWD";
    }
    return profile.preferredLine;
  }

  // 4. Strikers / Forwards
  if (
    text.includes("striker") ||
    text.includes("forward") ||
    /\b(st|cf|f|fw|lf|rf)\b/i.test(tp) ||
    /\b(st|cf|f|fw|lf|rf)\b/i.test(pos)
  ) {
    return "FWD";
  }

  // 5. Central / Defensive / Wide Midfielders
  if (
    text.includes("mid") ||
    /\b(m|mf|cm|dm|lm|rm|cdm)\b/i.test(tp) ||
    /\b(m|mf|cm|dm|lm|rm|cdm)\b/i.test(pos)
  ) {
    return "DEF_MID";
  }

  return "DEF_MID";
}

function getHorizontalRank(p: PotmCandidate): number {
  const tp = (p.tacticalPosition || "").toLowerCase().trim();

  // If a tactical position is known for this specific match, prioritize it completely!
  if (tp) {
    // 1. Center-Left specific
    if (
      tp.includes("center left") ||
      tp.includes("centre left") ||
      tp.includes("cd-l") ||
      tp.includes("cb-l") ||
      tp.includes("cm-l") ||
      tp.includes("dm-l") ||
      tp.includes("lcb") ||
      tp.includes("lcm") ||
      tp.includes("ldm")
    ) {
      return 30;
    }

    // 2. Center-Right specific
    if (
      tp.includes("center right") ||
      tp.includes("centre right") ||
      tp.includes("cd-r") ||
      tp.includes("cb-r") ||
      tp.includes("cm-r") ||
      tp.includes("dm-r") ||
      tp.includes("rcb") ||
      tp.includes("rcm") ||
      tp.includes("rdm")
    ) {
      return 70;
    }

    // 3. Left flank / wing
    if (
      tp.includes("left") ||
      tp.includes("am-l") ||
      tp.includes("cf-l") ||
      /\b(lf|lw|lb|lwb|lm)\b/i.test(tp)
    ) {
      return 10;
    }

    // 4. Right flank / wing
    if (
      tp.includes("right") ||
      tp.includes("am-r") ||
      tp.includes("cf-r") ||
      /\b(rf|rw|rb|rwb|rm)\b/i.test(tp)
    ) {
      return 90;
    }

    // 5. Pure Center
    if (
      tp.includes("center") ||
      tp.includes("centre") ||
      tp.includes("attacking midfielder") ||
      tp.includes("midfielder") ||
      tp.includes("forward") ||
      tp.includes("striker") ||
      tp.includes("defender") ||
      tp.includes("goalkeeper") ||
      /\b(f|cf|st|cm|dm|am|cam|cd|cb|g|gk)\b/i.test(tp)
    ) {
      return 50;
    }
  }

  // Fallback to ESPN formationPlace if present
  if (p.formationPlace) {
    if ([3, 11].includes(p.formationPlace)) return 10;
    if ([4, 6].includes(p.formationPlace)) return 30;
    if ([1, 5, 9, 10].includes(p.formationPlace)) return 50;
    if ([7, 8].includes(p.formationPlace)) return 70;
    if ([2].includes(p.formationPlace)) return 90;
  }

  // Known profile rank fallback
  const profile = getKnownPlayerProfile(p.name);
  if (profile) return profile.rank;

  // Fallback to generic player position
  const pos = (p.position || "").toLowerCase().trim();
  if (pos.includes("left") || /\b(lf|lw|lb|lwb|lm)\b/i.test(pos)) return 10;
  if (pos.includes("right") || /\b(rf|rw|rb|rwb|rm)\b/i.test(pos)) return 90;

  return 50;
}



export function PotmPicker({
  matchId,
  homeTeamName,
  awayTeamName,
  homeTeamLogoUrl,
  awayTeamLogoUrl,
  hasWatched = true,
  canRecordWatch = true,
  isFinished = true,
  isLive = false,
  onRecordWatch,
  onSaved,
}: {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogoUrl?: string | null;
  awayTeamLogoUrl?: string | null;
  hasWatched?: boolean;
  canRecordWatch?: boolean;
  isFinished?: boolean;
  isLive?: boolean;
  onRecordWatch?: () => void;
  onSaved: () => void;
}) {
  const { data: potmData, isLoading, refetch } = useMatchPotm(matchId);
  const { user } = useAuth();

  const [selectedTeamTab, setSelectedTeamTab] = useState<"home" | "away">("home");
  const [viewMode, setViewMode] = useState<"pitch" | "squad">("pitch");
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("ALL");
  const [pendingVote, setPendingVote] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [voteSuccessMessage, setVoteSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasLineupData = potmData?.hasLineupData ?? false;
  const candidates = potmData?.candidates ?? { home: [], away: [] };
  const currentCandidates: PotmCandidate[] =
    selectedTeamTab === "home" ? candidates.home : candidates.away;
  const activeFormation =
    selectedTeamTab === "home" ? potmData?.homeFormation : potmData?.awayFormation;

  // Filter verified starters and appearing substitutes (when lineup data is available)
  const starters = useMemo(() => {
    if (!hasLineupData) return [];
    return currentCandidates.filter((p) => p.isStarter === true);
  }, [hasLineupData, currentCandidates]);

  const appearingSubs = useMemo(() => {
    if (!hasLineupData) return [];
    const subs = currentCandidates.filter(
      (p) =>
        p.isStarter === false &&
        ((p.minutesPlayed !== null && p.minutesPlayed > 0) ||
          (p.subInMinute !== null && p.subInMinute !== undefined))
    );
    return subs.sort((a, b) => {
      const minA =
        a.subInMinute ?? (a.minutesPlayed !== null ? Math.max(1, 90 - a.minutesPlayed) : 99);
      const minB =
        b.subInMinute ?? (b.minutesPlayed !== null ? Math.max(1, 90 - b.minutesPlayed) : 99);
      if (minA !== minB) return minA - minB;
      return a.name.localeCompare(b.name);
    });
  }, [hasLineupData, currentCandidates]);

  // Group starters into pitch tactical rows: Strikers, Attacking Midfielders/Wingers, Defensive/Central Midfielders, Defenders, Goalkeeper
  const pitchRows = useMemo(() => {
    const gk: PotmCandidate[] = [];
    const def: PotmCandidate[] = [];
    const defMid: PotmCandidate[] = [];
    const attMid: PotmCandidate[] = [];
    const fwd: PotmCandidate[] = [];
    const other: PotmCandidate[] = [];

    for (const p of starters) {
      const line = getDetailedTacticalLine(p, activeFormation);
      if (line === "GK") gk.push(p);
      else if (line === "DEF") def.push(p);
      else if (line === "DEF_MID") defMid.push(p);
      else if (line === "ATT_MID") attMid.push(p);
      else if (line === "FWD") fwd.push(p);
      else other.push(p);
    }

    // STRICT GUARANTEE 1: Exactly 1 Goalkeeper on the pitch!
    if (gk.length > 1) {
      let trueGkIdx = gk.findIndex((p) => p.formationPlace === 1);
      if (trueGkIdx === -1) {
        trueGkIdx = gk.findIndex(
          (p) =>
            (p.position || "").toLowerCase().includes("goal") ||
            (p.tacticalPosition || "").toLowerCase().includes("goal")
        );
      }
      if (trueGkIdx === -1) trueGkIdx = 0;
      const trueGk = gk[trueGkIdx];
      const demoted = gk.filter((_, idx) => idx !== trueGkIdx);
      gk.length = 0;
      gk.push(trueGk);
      for (const p of demoted) {
        const ppos = (p.position || "").toLowerCase();
        if (ppos.includes("def")) def.push(p);
        else if (ppos.includes("att")) attMid.push(p);
        else defMid.push(p);
      }
    }

    // Distribute any uncategorized players gracefully
    for (const p of other) {
      if (gk.length === 0) gk.push(p);
      else if (def.length < 4) def.push(p);
      else if (defMid.length < 3) defMid.push(p);
      else fwd.push(p);
    }

    // STRICT GUARANTEE 2: 4-2-3-1 Formation Balancing
    if (activeFormation?.includes("4-2-3-1")) {
      // If fwd is empty but attMid has 4+ players, promote the most advanced/central to striker
      if (fwd.length === 0 && attMid.length >= 4) {
        let strikerIdx = attMid.findIndex((p) => p.formationPlace === 9);
        if (strikerIdx === -1) {
          strikerIdx = attMid.findIndex(
            (p) =>
              (p.tacticalPosition || "").toLowerCase().includes("forward") ||
              (p.position || "").toLowerCase().includes("att")
          );
        }
        if (strikerIdx === -1) strikerIdx = 0;
        fwd.push(attMid.splice(strikerIdx, 1)[0]);
      }
    }

    // STRICT GUARANTEE 3: 4-3-3 Formation Balancing
    if (activeFormation?.includes("4-3-3")) {
      if (fwd.length < 3 && attMid.length > 0) {
        while (fwd.length < 3 && attMid.length > 0) {
          fwd.push(attMid.shift()!);
        }
      }
    }

    // Sort players horizontally: Left flank (rank 10) -> Center (rank 50) -> Right flank (rank 90)
    const sortByFlank = (a: PotmCandidate, b: PotmCandidate) => {
      const rankDiff = getHorizontalRank(a) - getHorizontalRank(b);
      if (rankDiff !== 0) return rankDiff;
      if (a.formationPlace && b.formationPlace) return a.formationPlace - b.formationPlace;
      return a.name.localeCompare(b.name);
    };

    // Balance 3-player rows so CAM/ST is dead center and wingers flank left and right
    const balanceTrio = (trio: PotmCandidate[]) => {
      if (trio.length !== 3) {
        trio.sort(sortByFlank);
        return trio;
      }
      let bestCenterIdx = 0;
      let minDistance = 999;
      trio.forEach((p, idx) => {
        const r = getHorizontalRank(p);
        const dist = Math.abs(r - 50);
        if (dist < minDistance) {
          minDistance = dist;
          bestCenterIdx = idx;
        }
      });

      const centerPlayer = trio[bestCenterIdx];
      const wingers = trio.filter((_, idx) => idx !== bestCenterIdx);

      wingers.sort((a, b) => {
        const rA = getHorizontalRank(a);
        const rB = getHorizontalRank(b);
        if (rA !== rB) return rA - rB;
        if (a.formationPlace && b.formationPlace) return a.formationPlace - b.formationPlace;
        return a.name.localeCompare(b.name);
      });

      return [wingers[0], centerPlayer, wingers[1]];
    };

    const sortedFwd = balanceTrio(fwd);
    const sortedAttMid = balanceTrio(attMid);
    const sortedDefMid = balanceTrio(defMid);
    def.sort(sortByFlank);
    gk.sort(sortByFlank);

    // Top to bottom: Strikers -> Attacking Midfielders / Wingers -> Central Midfielders -> Defenders -> Goalkeeper
    return { fwd: sortedFwd, attMid: sortedAttMid, defMid: sortedDefMid, def, gk };
  }, [starters, activeFormation]);

  // Filter squad players by search query and position filter
  const filteredSquad = useMemo(() => {
    return currentCandidates.filter((p) => {
      const matchesSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      if (!matchesSearch) return false;

      if (positionFilter === "ALL") return true;
      const cat = getPositionCategory(p);
      return cat === positionFilter;
    });
  }, [currentCandidates, searchQuery, positionFilter]);

  // Position counts for filter pills
  const positionCounts = useMemo(() => {
    const counts = { ALL: currentCandidates.length, ATT: 0, MID: 0, DEF: 0, GK: 0 };
    for (const p of currentCandidates) {
      const cat = getPositionCategory(p);
      if (cat === "ATT") counts.ATT++;
      else if (cat === "MID") counts.MID++;
      else if (cat === "DEF") counts.DEF++;
      else if (cat === "GK") counts.GK++;
    }
    return counts;
  }, [currentCandidates]);

  if (isLoading || !potmData) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <p className="text-xs text-[var(--color-text-dim)]">Loading Player of the Match voting...</p>
      </div>
    );
  }

  const { topThree, peoplesMotm, myVote, totalVotes } = potmData;

  // Active selection: pending choice takes precedence over existing vote
  const activeSelection = pendingVote ?? myVote;

  // Find candidate object for active selection
  const allKnownCandidates = [...candidates.home, ...candidates.away];
  const selectedPlayer = allKnownCandidates.find((c) => c.id === activeSelection);
  const pendingPlayer = allKnownCandidates.find((c) => c.id === pendingVote);

  function handleSelectPlayer(playerId: string) {
    if (!user || voting) return;
    setVoteSuccessMessage(null);
    setError(null);

    // Toggle off if clicking the currently pending selection
    if (pendingVote === playerId) {
      setPendingVote(null);
    } else {
      setPendingVote(playerId);
    }
  }

  async function handleSubmitVote() {
    if (!user || !pendingVote || voting) return;
    if (!hasWatched) {
      if (onRecordWatch) onRecordWatch();
      return;
    }
    if (!isFinished) return;
    setVoting(true);
    setError(null);
    setVoteSuccessMessage(null);
    const chosenName = pendingPlayer?.name ?? "player";

    try {
      await api.post(`/matches/${matchId}/potm`, { playerId: pendingVote });
      await refetch();
      setVoteSuccessMessage(`✓ Your vote for ${chosenName} has been recorded!`);
      setPendingVote(null);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't record your vote.");
    } finally {
      setVoting(false);
    }
  }

  const activeTeamName = selectedTeamTab === "home" ? homeTeamName : awayTeamName;
  const isLineupViewAvailable = hasLineupData && starters.length > 0;

  return (
    <div className="space-y-4">
      {/* Notice when viewing lineup without recorded watch */}
      {!hasWatched && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl select-none">📋</span>
            <div>
              <p className="text-xs font-bold text-slate-200">
                {isLive ? "Live Match Lineups" : "Full Match Lineup"}
              </p>
              <p className="text-[11px] text-slate-400">
                {isLive
                  ? "Real-time formations and participants are shown below. Voting for Player of the Match unlocks at full-time."
                  : "Both starting XIs, tactical formations, and substitutes are shown below. Record that you watched this match to vote for Player of the Match."}
              </p>
            </div>
          </div>
          {isFinished && canRecordWatch && onRecordWatch && (
            <button
              type="button"
              onClick={onRecordWatch}
              className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 transition-all shadow-md shrink-0 cursor-pointer"
            >
              Record Watch
            </button>
          )}
        </div>
      )}

      {/* People's MOTM Winner Banner */}
      {peoplesMotm && (
        <div className="rounded-xl bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⭐</span>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-extrabold text-amber-400">
                People's POTM Award
              </p>
              <Link
                to={`/players/${peoplesMotm.playerId}`}
                className="font-extrabold text-base text-[var(--color-text)] hover:text-amber-400 transition-colors"
              >
                {peoplesMotm.name}
              </Link>
              {peoplesMotm.position && (
                <p className="text-xs text-[var(--color-text-dim)]">{formatPosition(peoplesMotm.position)}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-amber-400">
              {peoplesMotm.votes} {peoplesMotm.votes === 1 ? "vote" : "votes"}
            </p>
            <p className="text-[11px] text-[var(--color-text-dim)]">{peoplesMotm.percentage}% of votes</p>
          </div>
        </div>
      )}

      {/* Match-level MOTM Leaderboard: Top 3 */}
      {topThree.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-[var(--color-text-dim)] uppercase tracking-wider">
              POTM Voting Leaderboard ({totalVotes} total {totalVotes === 1 ? "vote" : "votes"})
            </h3>
          </div>
          <div className="space-y-2">
            {topThree.map((item) => (
              <div key={item.playerId} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                        item.rank === 1
                          ? "bg-amber-400 text-black"
                          : item.rank === 2
                          ? "bg-slate-300 text-black"
                          : "bg-amber-700 text-white"
                      }`}
                    >
                      {item.rank}
                    </span>
                    <Link
                      to={`/players/${item.playerId}`}
                      className="font-bold hover:text-[var(--color-primary)] transition-colors"
                    >
                      {item.name}
                    </Link>
                    {item.position && (
                      <span className="text-[var(--color-text-dim)]">({formatPosition(item.position)})</span>
                    )}
                    {myVote === item.playerId && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--color-primary)] text-black">
                        Your Vote
                      </span>
                    )}
                  </div>
                  <span className="font-bold text-[var(--color-text)]">
                    {item.votes} ({item.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-[var(--color-surface-2)] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      item.rank === 1 ? "bg-amber-400" : "bg-[var(--color-primary)]"
                    }`}
                    style={{ width: `${Math.max(item.percentage, 4)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Voting Section Container */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <p className="text-xs font-bold text-[var(--color-text-dim)] uppercase tracking-wider">
              {myVote ? "Change Your Vote" : "Vote For Player of the Match"}
            </p>
            <p className="text-[11px] text-[var(--color-text-dim)] mt-0.5">
              {isLineupViewAvailable
                ? "Select a player who played in the game (starter on pitch or substitute), then submit your vote."
                : `Select any player from ${activeTeamName}'s squad, then submit your vote.`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle if Lineup Data is Available */}
            {isLineupViewAvailable && (
              <div className="flex gap-1 bg-[var(--color-surface-2)] p-1 rounded-xl border border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => setViewMode("pitch")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === "pitch"
                      ? "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm font-bold"
                      : "text-[var(--color-text-dim)] hover:text-white"
                  }`}
                >
                  Pitch View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("squad")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === "squad"
                      ? "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm font-bold"
                      : "text-[var(--color-text-dim)] hover:text-white"
                  }`}
                >
                  Participants List
                </button>
              </div>
            )}

            {/* Team Switcher Tabs */}
            <div className="flex gap-1.5 bg-[var(--color-surface-2)] p-1 rounded-xl border border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => {
                  setSelectedTeamTab("home");
                  setVoteSuccessMessage(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedTeamTab === "home"
                    ? "bg-[var(--color-primary)] text-black shadow-sm"
                    : "text-[var(--color-text-dim)] hover:text-white"
                }`}
              >
                {homeTeamLogoUrl && (
                  <img src={homeTeamLogoUrl} alt="" className="w-3.5 h-3.5 object-contain" />
                )}
                {homeTeamName}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTeamTab("away");
                  setVoteSuccessMessage(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedTeamTab === "away"
                    ? "bg-[var(--color-primary)] text-black shadow-sm"
                    : "text-[var(--color-text-dim)] hover:text-white"
                }`}
              >
                {awayTeamLogoUrl && (
                  <img src={awayTeamLogoUrl} alt="" className="w-3.5 h-3.5 object-contain" />
                )}
                {awayTeamName}
              </button>
            </div>
          </div>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 font-medium flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}
        {voteSuccessMessage && (
          <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-medium flex items-center gap-2">
            <span>✓</span> {voteSuccessMessage}
          </div>
        )}

        {/* VIEW 1: Pitch Layout (only when reliable lineup data is available and pitch view active) */}
        {isLineupViewAvailable && viewMode === "pitch" ? (
          <div className="space-y-6">
            <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/40 bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-950 p-4 sm:p-6 shadow-inner select-none">
              <div className="absolute inset-0 pointer-events-none opacity-20">
                <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                  {/* Outer pitch boundary */}
                  <rect x="2%" y="2%" width="96%" height="96%" fill="none" stroke="#ffffff" strokeWidth="1.5" />
                  {/* Halfway line */}
                  <line x1="2%" y1="50%" x2="98%" y2="50%" stroke="#ffffff" strokeWidth="1.5" />
                  {/* Center circle and spot */}
                  <circle cx="50%" cy="50%" r="44" fill="none" stroke="#ffffff" strokeWidth="1.5" />
                  <circle cx="50%" cy="50%" r="3" fill="#ffffff" />
                  {/* Top penalty area & goal area (compact so it does not collide with forwards) */}
                  <rect x="26%" y="2%" width="48%" height="13%" fill="none" stroke="#ffffff" strokeWidth="1.5" />
                  <rect x="37%" y="2%" width="26%" height="5%" fill="none" stroke="#ffffff" strokeWidth="1.5" />
                  {/* Bottom penalty area & goal area */}
                  <rect x="26%" y="85%" width="48%" height="13%" fill="none" stroke="#ffffff" strokeWidth="1.5" />
                  <rect x="37%" y="93%" width="26%" height="5%" fill="none" stroke="#ffffff" strokeWidth="1.5" />
                  <circle cx="50%" cy="89%" r="2.5" fill="#ffffff" />
                </svg>
              </div>

              <div className="relative z-10 space-y-7 sm:space-y-9 pt-3 pb-3">
                <div className="text-center">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400/80 bg-black/40 px-3 py-1 rounded-full border border-emerald-500/20">
                    {activeTeamName} Starting XI {activeFormation ? `(${activeFormation})` : ""}
                  </span>
                </div>

                {pitchRows.fwd.length > 0 && (
                  <PitchLine
                    players={pitchRows.fwd}
                    activeSelection={activeSelection}
                    myVote={myVote}
                    onSelect={handleSelectPlayer}
                    disabled={!user || voting}
                    rowType="FWD"
                  />
                )}
                {pitchRows.attMid.length > 0 && (
                  <PitchLine
                    players={pitchRows.attMid}
                    activeSelection={activeSelection}
                    myVote={myVote}
                    onSelect={handleSelectPlayer}
                    disabled={!user || voting}
                    rowType="ATT_MID"
                  />
                )}
                {pitchRows.defMid.length > 0 && (
                  <PitchLine
                    players={pitchRows.defMid}
                    activeSelection={activeSelection}
                    myVote={myVote}
                    onSelect={handleSelectPlayer}
                    disabled={!user || voting}
                    rowType="DEF_MID"
                  />
                )}
                {pitchRows.def.length > 0 && (
                  <PitchLine
                    players={pitchRows.def}
                    activeSelection={activeSelection}
                    myVote={myVote}
                    onSelect={handleSelectPlayer}
                    disabled={!user || voting}
                    rowType="DEF"
                  />
                )}
                {pitchRows.gk.length > 0 && (
                  <PitchLine
                    players={pitchRows.gk}
                    activeSelection={activeSelection}
                    myVote={myVote}
                    onSelect={handleSelectPlayer}
                    disabled={!user || voting}
                    rowType="GK"
                  />
                )}
              </div>
            </div>

            {/* Substitutes Who Actually Entered the Match */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-[var(--color-text-dim)] uppercase tracking-wider flex items-center gap-1.5">
                  <span>🔄</span> Substitutes Who Appeared ({appearingSubs.length})
                </h4>
              </div>

              {appearingSubs.length === 0 ? (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3 text-center">
                  <p className="text-xs text-[var(--color-text-dim)]">
                    No substitutes entered the pitch for this team.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {appearingSubs.map((sub) => {
                    const isPending = activeSelection === sub.id && myVote !== sub.id;
                    const isCurrentVote = myVote === sub.id;
                    const subMinute =
                      sub.subInMinute ?? (sub.minutesPlayed !== null ? Math.max(1, 90 - sub.minutesPlayed) : null);

                    return (
                      <button
                        key={sub.id}
                        type="button"
                        disabled={!user || voting}
                        onClick={() => handleSelectPlayer(sub.id)}
                        className={`p-2.5 rounded-xl text-left border transition-all text-xs flex items-center justify-between gap-2 ${
                          isPending
                            ? "bg-[var(--color-primary)]/20 border-[var(--color-primary)] text-white shadow-md ring-2 ring-[var(--color-primary)]/60"
                            : isCurrentVote
                            ? "bg-emerald-500/15 border-emerald-500/60 text-white"
                            : "bg-[var(--color-surface-2)] border-[var(--color-border)] hover:border-[var(--color-primary)]/50 text-[var(--color-text)]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center font-bold text-[10px] overflow-hidden flex-shrink-0">
                            {sub.photoUrl ? (
                              <img src={sub.photoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              playerInitials(sub.name)
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold truncate">{sub.name}</p>
                            <p className="text-[10px] text-[var(--color-text-dim)]">
                              {formatPosition(sub.position) || "Substitute"}
                              {subMinute ? ` · Subbed on ${formatMatchMinute(subMinute)}` : sub.minutesPlayed ? ` · ${sub.minutesPlayed}' played` : ""}
                            </p>
                          </div>
                        </div>

                        {isPending && (
                          <span className="text-[var(--color-primary)] font-bold text-sm">✓</span>
                        )}
                        {isCurrentVote && !isPending && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-300">
                            Voted
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* VIEW 2: Full Squad List (interactive squad cards with filters & search) */
          <div className="space-y-4">
            {/* Squad Controls Header */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--color-surface-2)]/60 p-3 rounded-xl border border-[var(--color-border)]">
              {/* Search input */}
              <div className="relative flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder={
                    isLineupViewAvailable
                      ? `Search ${activeTeamName} players who played (e.g. Yamal)...`
                      : `Search ${activeTeamName} squad (e.g. Yamal, Lewandowski)...`
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-primary)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-dim)] hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Position Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                {[
                  { key: "ALL", label: "All", count: positionCounts.ALL },
                  { key: "ATT", label: "Attack", count: positionCounts.ATT },
                  { key: "MID", label: "Midfield", count: positionCounts.MID },
                  { key: "DEF", label: "Defence", count: positionCounts.DEF },
                  { key: "GK", label: "GK", count: positionCounts.GK },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setPositionFilter(item.key)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                      positionFilter === item.key
                        ? "bg-[var(--color-primary)] text-black font-bold shadow-sm"
                        : "bg-[var(--color-surface)] text-[var(--color-text-dim)] hover:text-white border border-[var(--color-border)]"
                    }`}
                  >
                    {item.label} ({item.count})
                  </button>
                ))}
              </div>
            </div>

            {/* Candidate Cards Grid */}
            {filteredSquad.length === 0 ? (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/30 p-8 text-center">
                <p className="text-xs text-[var(--color-text-dim)]">
                  {searchQuery || positionFilter !== "ALL"
                    ? "No squad players match your search filter."
                    : `No squad players found for ${activeTeamName}.`}
                </p>
                {(searchQuery || positionFilter !== "ALL") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setPositionFilter("ALL");
                    }}
                    className="mt-2 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[460px] overflow-y-auto pr-1">
                {filteredSquad.map((player) => {
                  const isPending = pendingVote === player.id;
                  const isCurrentVote = myVote === player.id;
                  const isSelected = isPending || (isCurrentVote && !pendingVote);

                  return (
                    <button
                      key={player.id}
                      type="button"
                      disabled={!user || voting}
                      onClick={() => handleSelectPlayer(player.id)}
                      className={`group relative p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between gap-2 focus:outline-none ${
                        isPending
                          ? "bg-[var(--color-primary)]/20 border-[var(--color-primary)] shadow-md ring-2 ring-[var(--color-primary)]/80 text-white"
                          : isCurrentVote
                          ? "bg-emerald-500/15 border-emerald-500/70 text-white shadow-sm"
                          : "bg-[var(--color-surface-2)] border-[var(--color-border)] hover:border-[var(--color-primary)]/60 text-[var(--color-text)]"
                      } ${!user || voting ? "cursor-default opacity-85" : "cursor-pointer"}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Player Avatar */}
                        <div
                          className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-[10px] overflow-hidden flex-shrink-0 transition-colors ${
                            isSelected
                              ? "bg-[var(--color-primary)] text-black border-white shadow"
                              : isCurrentVote
                              ? "bg-emerald-500 text-white border-emerald-400"
                              : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] group-hover:border-[var(--color-primary)]/60"
                          }`}
                        >
                          {player.photoUrl ? (
                            <img src={player.photoUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            playerInitials(player.name)
                          )}
                        </div>

                        {/* Player Details */}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs truncate leading-tight group-hover:text-white">
                            {player.name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-semibold text-[var(--color-text-dim)] uppercase">
                              {formatPosition(player.position) || "Player"}
                            </span>
                            {player.isStarter === true ? (
                              <span className="text-[10px] text-emerald-400 font-medium">
                                · Starter{player.minutesPlayed ? ` (${player.minutesPlayed}')` : ""}
                              </span>
                            ) : player.isStarter === false ? (
                              <span className="text-[10px] text-amber-400 font-medium">
                                · Sub{player.subInMinute ? ` (on ${formatMatchMinute(player.subInMinute)})` : player.minutesPlayed ? ` (on ${formatMatchMinute(Math.max(1, 90 - player.minutesPlayed))})` : ""}
                              </span>
                            ) : player.minutesPlayed !== null && player.minutesPlayed > 0 ? (
                              <span className="text-[10px] text-emerald-400 font-medium">
                                · {player.minutesPlayed}'
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Vote Status Indicators */}
                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[var(--color-border)]/40 mt-1">
                        <span className="text-[10px] text-[var(--color-text-dim)]">
                          {getPositionCategory(player)}
                        </span>

                        {isPending ? (
                          <span className="font-bold text-[var(--color-primary)] flex items-center gap-1">
                            <span>✓</span> Selected
                          </span>
                        ) : isCurrentVote ? (
                          <span className="font-bold text-emerald-400 flex items-center gap-1">
                            <span>★</span> Your Vote
                          </span>
                        ) : !hasWatched ? (
                          <span className="text-[var(--color-text-dim)] group-hover:text-[var(--color-primary)] transition-colors">
                            Select player
                          </span>
                        ) : (
                          <span className="text-[var(--color-text-dim)] group-hover:text-[var(--color-primary)] transition-colors">
                            Tap to vote
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Explicit Vote Confirmation & Action Footer */}
        {user ? (
          <div className="mt-5 pt-4 border-t border-[var(--color-border)] flex items-center justify-between flex-wrap gap-3">
            {isLive ? (
              <p className="text-xs text-[var(--color-text-dim)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                <span>Match is currently in progress. Player of the Match voting unlocks once the final whistle sounds.</span>
              </p>
            ) : hasWatched ? (
              <>
                <div>
                  {pendingPlayer ? (
                    <div className="text-xs">
                      <span className="text-[var(--color-text-dim)]">Selected for vote: </span>
                      <span className="font-extrabold text-[var(--color-primary)]">
                        {pendingPlayer.name}
                      </span>{" "}
                      <span className="text-[var(--color-text-dim)]">
                        ({formatPosition(pendingPlayer.position) || "Player"})
                      </span>
                    </div>
                  ) : selectedPlayer ? (
                    <div className="text-xs">
                      <span className="text-[var(--color-text-dim)]">Current vote: </span>
                      <span className="font-bold text-emerald-400">{selectedPlayer.name}</span>
                      <span className="text-[var(--color-text-dim)] ml-2 italic">
                        (Tap any other player to change your vote)
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--color-text-dim)] italic">
                      Tap any player from the squad to select them, then submit your vote.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSubmitVote}
                  disabled={!pendingVote || voting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[var(--color-primary)] text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-md cursor-pointer"
                >
                  {voting && (
                    <span className="inline-block w-3.5 h-3.5 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                  )}
                  {voting
                    ? "Submitting Vote..."
                    : myVote
                    ? "Change Vote"
                    : "Submit Vote"}
                </button>
              </>
            ) : (
              <>
                <div>
                  {pendingPlayer ? (
                    <div className="text-xs">
                      <span className="text-[var(--color-text-dim)]">Selected player: </span>
                      <span className="font-extrabold text-[var(--color-primary)]">
                        {pendingPlayer.name}
                      </span>{" "}
                      <span className="text-[var(--color-text-dim)]">
                        ({formatPosition(pendingPlayer.position) || "Player"})
                      </span>
                      <span className="block text-[11px] text-amber-400 font-semibold mt-0.5">
                        Record that you watched this match to cast your vote.
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--color-text-dim)] italic">
                      Record that you watched this match to vote for Player of the Match.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (onRecordWatch) onRecordWatch();
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 transition-all flex items-center gap-2 shadow-md cursor-pointer"
                >
                  Record Watch to Vote
                </button>
              </>
            )}
          </div>
        ) : (
          <p className="mt-4 text-xs text-[var(--color-text-dim)] text-center">
            Sign in and record that you watched this match to vote for Player of the Match.
          </p>
        )}
      </div>
    </div>
  );
}

/** Pitch tactical row of players */
function PitchLine({
  players,
  activeSelection,
  myVote,
  onSelect,
  disabled,
  rowType,
}: {
  players: PotmCandidate[];
  activeSelection: string | null;
  myVote: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
  rowType?: "FWD" | "ATT_MID" | "DEF_MID" | "DEF" | "GK";
}) {
  if (players.length === 0) return null;

  const renderPlayer = (p: PotmCandidate) => {
    const isSelected = activeSelection === p.id;
    const isCurrentVote = myVote === p.id;

    return (
      <button
        key={p.id}
        type="button"
        disabled={disabled}
        onClick={() => onSelect(p.id)}
        className={`group flex flex-col items-center gap-1 transition-all focus:outline-none ${
          disabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"
        } ${isSelected ? "scale-110 z-20" : "hover:scale-105"}`}
      >
        {/* Player Avatar / Shirt Circle on Pitch */}
        <div className="relative">
          <div
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center font-black text-xs sm:text-sm overflow-hidden border-2 transition-all shadow-md ${
              isSelected
                ? "bg-[var(--color-primary)] text-black border-white ring-4 ring-[var(--color-primary)] shadow-[0_0_15px_rgba(255,255,255,0.6)]"
                : isCurrentVote
                ? "bg-emerald-500 text-white border-white ring-2 ring-emerald-400"
                : "bg-[#25282c] text-white border-white/70 group-hover:border-[var(--color-primary)]"
            }`}
          >
            {p.photoUrl ? (
              <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
            ) : (
              <span>{playerInitials(p.name)}</span>
            )}
          </div>

          {/* Vote status indicator badge */}
          {isCurrentVote && (
            <span className="absolute -top-1 -right-1 bg-amber-400 text-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-black shadow">
              ★
            </span>
          )}
        </div>

        {/* Name Tag */}
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-bold truncate max-w-[84px] sm:max-w-[102px] text-center transition-colors shadow ${
            isSelected
              ? "bg-[var(--color-primary)] text-black font-extrabold"
              : isCurrentVote
              ? "bg-emerald-600 text-white"
              : "bg-black/80 text-white/90 group-hover:bg-black group-hover:text-white"
          }`}
        >
          {p.name.split(" ").slice(-1)[0] || p.name}
        </span>
      </button>
    );
  };

  // 1 Player: Dead center of the pitch
  if (players.length === 1) {
    return (
      <div className="flex justify-center items-center w-full px-2 sm:px-6">
        {renderPlayer(players[0])}
      </div>
    );
  }

  // 2 Players: Symmetrically placed in central channels (cols 2 & 3 of 4)
  if (players.length === 2) {
    return (
      <div className="grid grid-cols-4 w-full px-2 sm:px-6">
        <div className="col-start-2 flex justify-center">{renderPlayer(players[0])}</div>
        <div className="col-start-3 flex justify-center">{renderPlayer(players[1])}</div>
      </div>
    );
  }

  // 3 Players: Left, Dead Center, Right (Col 2 is mathematically locked at exactly 50% width)
  if (players.length === 3) {
    const isFwd = rowType === "FWD";
    const isDefMid = rowType === "DEF_MID";

    return (
      <div className="grid grid-cols-3 w-full px-2 sm:px-6 items-center">
        <div className={`flex justify-center ${isFwd ? "translate-y-1 sm:translate-y-2" : ""}`}>
          {renderPlayer(players[0])}
        </div>
        <div
          className={`flex justify-center ${
            isFwd
              ? "-translate-y-3 sm:-translate-y-4"
              : isDefMid
              ? "translate-y-2 sm:translate-y-3"
              : ""
          }`}
        >
          {renderPlayer(players[1])}
        </div>
        <div className={`flex justify-center ${isFwd ? "translate-y-1 sm:translate-y-2" : ""}`}>
          {renderPlayer(players[2])}
        </div>
      </div>
    );
  }

  // 4 Players: Even 4-slot grid (LB, LCB, RCB, RB)
  if (players.length === 4) {
    return (
      <div className="grid grid-cols-4 w-full px-2 sm:px-6">
        {players.map((p) => (
          <div key={p.id} className="flex justify-center">
            {renderPlayer(p)}
          </div>
        ))}
      </div>
    );
  }

  // 5 Players: Even 5-slot grid (Col 3 is locked at exactly 50% width)
  if (players.length === 5) {
    return (
      <div className="grid grid-cols-5 w-full px-2 sm:px-6">
        {players.map((p) => (
          <div key={p.id} className="flex justify-center">
            {renderPlayer(p)}
          </div>
        ))}
      </div>
    );
  }

  // Fallback for any other count
  return (
    <div className="flex justify-around items-center w-full px-2 sm:px-6 gap-2">
      {players.map((p) => renderPlayer(p))}
    </div>
  );
}

