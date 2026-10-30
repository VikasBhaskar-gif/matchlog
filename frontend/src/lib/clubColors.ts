export interface ClubStyle {
  background: string;
  textColor: string;
  borderColor: string;
  badgeBg?: string;
}

const CLUB_JERSEY_MAP: Record<string, ClubStyle> = {
  // FC Barcelona: iconic Blaugrana garnet red (distinct from Arsenal and United)
  "fc barcelona": {
    background: "#a50044",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "barcelona": {
    background: "#a50044",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Real Madrid CF: Royal white with dark text
  "real madrid cf": {
    background: "#ffffff",
    textColor: "#0f172a",
    borderColor: "rgba(0, 0, 0, 0.15)",
    badgeBg: "rgba(15, 23, 42, 0.08)",
  },
  "real madrid": {
    background: "#ffffff",
    textColor: "#0f172a",
    borderColor: "rgba(0, 0, 0, 0.15)",
    badgeBg: "rgba(15, 23, 42, 0.08)",
  },

  // Liverpool FC: Anfield crimson red
  "liverpool fc": {
    background: "#c8102e",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "liverpool": {
    background: "#c8102e",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Chelsea FC: Stamford Bridge royal blue
  "chelsea fc": {
    background: "#034694",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "chelsea": {
    background: "#034694",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Manchester United FC: Red Devil red
  "manchester united fc": {
    background: "#da291c",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "manchester united": {
    background: "#da291c",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Arsenal FC: Bright cannon scarlet red
  "arsenal fc": {
    background: "#ef0107",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "arsenal": {
    background: "#ef0107",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Manchester City FC: Sky blue
  "manchester city fc": {
    background: "#6cabdd",
    textColor: "#0f172a",
    borderColor: "rgba(255, 255, 255, 0.3)",
    badgeBg: "rgba(255, 255, 255, 0.8)",
  },
  "manchester city": {
    background: "#6cabdd",
    textColor: "#0f172a",
    borderColor: "rgba(255, 255, 255, 0.3)",
    badgeBg: "rgba(255, 255, 255, 0.8)",
  },

  // Paris Saint-Germain FC: Midnight navy
  "paris saint-germain fc": {
    background: "#004170",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "psg": {
    background: "#004170",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // FC Bayern München: Bavarian red
  "fc bayern münchen": {
    background: "#dc052d",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "bayern münchen": {
    background: "#dc052d",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "bayern": {
    background: "#dc052d",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Borussia Dortmund: Neon yellow
  "borussia dortmund": {
    background: "#fde100",
    textColor: "#000000",
    borderColor: "rgba(0, 0, 0, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.75)",
  },
  "dortmund": {
    background: "#fde100",
    textColor: "#000000",
    borderColor: "rgba(0, 0, 0, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.75)",
  },

  // Juventus FC: Bianconeri solid black
  "juventus fc": {
    background: "#18181b",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(255, 255, 255, 0.15)",
  },
  "juventus": {
    background: "#18181b",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(255, 255, 255, 0.15)",
  },

  // AC Milan: Rossonero red
  "ac milan": {
    background: "#ac1a2f",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.4)",
  },

  // Inter Milan: Nerazzurro royal blue
  "inter milan": {
    background: "#001489",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.4)",
  },
  "fc internazionale milano": {
    background: "#001489",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.4)",
  },

  // Club Atlético de Madrid: Atleti red
  "club atlético de madrid": {
    background: "#cb3524",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "atlético de madrid": {
    background: "#cb3524",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.25)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Tottenham Hotspur FC: Deep navy
  "tottenham hotspur fc": {
    background: "#132257",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(255, 255, 255, 0.15)",
  },
  "tottenham": {
    background: "#132257",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(255, 255, 255, 0.15)",
  },

  // AS Roma: Giallorossi imperial red
  "as roma": {
    background: "#8e1f2f",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "roma": {
    background: "#8e1f2f",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Sevilla FC: Red
  "sevilla fc": {
    background: "#d4001f",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "sevilla": {
    background: "#d4001f",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Real Betis: Verdiblanco green
  "real betis balompié": {
    background: "#00954c",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "real betis": {
    background: "#00954c",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "betis": {
    background: "#00954c",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Galatasaray SK: Crimson
  "galatasaray sk": {
    background: "#a90432",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "galatasaray": {
    background: "#a90432",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Bayer 04 Leverkusen: Red & Black
  "bayer 04 leverkusen": {
    background: "#e32219",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "leverkusen": {
    background: "#e32219",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Aston Villa: Claret
  "aston villa fc": {
    background: "#670e36",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },
  "aston villa": {
    background: "#670e36",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  },

  // Newcastle United: Black
  "newcastle united fc": {
    background: "#18181b",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(255, 255, 255, 0.15)",
  },
  "newcastle united": {
    background: "#18181b",
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(255, 255, 255, 0.15)",
  },
};

export function getClubStyle(teamName?: string | null): ClubStyle {
  if (!teamName) {
    return {
      background: "#1e293b",
      textColor: "#ffffff",
      borderColor: "rgba(255, 255, 255, 0.1)",
      badgeBg: "rgba(0, 0, 0, 0.3)",
    };
  }

  const clean = teamName.trim().toLowerCase();

  for (const [key, style] of Object.entries(CLUB_JERSEY_MAP)) {
    if (clean === key || clean.includes(key) || key.includes(clean)) {
      return style;
    }
  }

  // Dynamic solid fallback: generates a harmonious rich single color based on the club's name hash
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;

  return {
    background: `hsl(${hue}, 70%, 35%)`,
    textColor: "#ffffff",
    borderColor: "rgba(255, 255, 255, 0.2)",
    badgeBg: "rgba(0, 0, 0, 0.35)",
  };
}
