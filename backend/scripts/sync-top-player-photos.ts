import { db } from "../src/db/client.js";
import { players, teams } from "../src/db/schema/index.js";
import { eq, or, isNull } from "drizzle-orm";

export async function fetchWikipediaPhoto(playerName: string): Promise<string | null> {
  const cleanName = playerName.trim();
  const variations = [
    cleanName,
    `${cleanName} (footballer)`,
    `${cleanName} (soccer)`,
  ];

  for (const q of variations) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      q
    )}&prop=pageimages&format=json&pithumbsize=250&pilicense=any&redirects=1`;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "MatchlogApp/1.0 (contact@matchlog.app)" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const pages = data.query?.pages ?? {};
      const page: any = Object.values(pages)[0];
      if (page?.thumbnail?.source) {
        return page.thumbnail.source;
      }
    } catch {}
  }

  // Fallback: Wikipedia search API
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      cleanName + " footballer"
    )}&gsrlimit=1&prop=pageimages&format=json&pithumbsize=250&pilicense=any`;
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "MatchlogApp/1.0 (contact@matchlog.app)" },
    });
    if (res.ok) {
      const data = await res.json();
      const pages = data.query?.pages ?? {};
      const page: any = Object.values(pages)[0];
      if (page?.thumbnail?.source) {
        return page.thumbnail.source;
      }
    }
  } catch {}

  return null;
}

async function main() {
  const targetTeams = await db.query.teams.findMany({
    where: (t, { or, ilike }) =>
      or(
        ilike(t.name, "%Barcelona%"),
        ilike(t.name, "%Real Madrid%"),
        ilike(t.name, "%Paris%"),
        ilike(t.name, "%Manchester City%"),
        ilike(t.name, "%Arsenal%"),
        ilike(t.name, "%Liverpool%"),
        ilike(t.name, "%Bayern%"),
        ilike(t.name, "%Atlético%"),
        ilike(t.name, "%Inter%"),
        ilike(t.name, "%Juventus%")
      ),
  });

  const teamIds = targetTeams.map((t) => t.id);
  const teamPlayers = await db.query.players.findMany({
    where: (p, { inArray }) => inArray(p.currentTeamId, teamIds),
  });

  console.log(`Found ${teamPlayers.length} players across top teams.`);

  let updated = 0;
  for (const p of teamPlayers) {
    if (p.photoUrl) continue;
    const photo = await fetchWikipediaPhoto(p.name);
    if (photo) {
      await db.update(players).set({ photoUrl: photo }).where(eq(players.id, p.id));
      console.log(`✓ Updated photo for ${p.name}: ${photo.slice(0, 60)}...`);
      updated++;
    }
  }

  console.log(`Done! Updated ${updated} players with photos.`);
}

main().catch(console.error).finally(() => process.exit(0));
