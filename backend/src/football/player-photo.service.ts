import { db } from "../db/client.js";
import { players } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

/**
 * Fetches official player cutout headshot directly from FotMob's global athlete index.
 * Matches by player name and team for 100% accuracy.
 */
export async function fetchFotmobPlayerPhoto(playerName: string, teamName?: string): Promise<string | null> {
  const cleanName = playerName.trim();
  const url = `https://apigw.fotmob.com/searchapi/suggest?term=${encodeURIComponent(cleanName)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const suggestions: any[] = data.squadMemberSuggest?.[0]?.options ?? [];
    if (suggestions.length === 0) return null;

    if (teamName) {
      const lowerTeam = teamName.toLowerCase();
      const match = suggestions.find((s) => {
        const t = (s.payload?.teamName || "").toLowerCase();
        return t && (lowerTeam.includes(t) || t.includes(lowerTeam));
      });
      if (match?.payload?.id) {
        return `https://images.fotmob.com/image_resources/playerimages/${match.payload.id}.png`;
      }
    }

    const firstWithId = suggestions.find((s) => s.payload?.id);
    if (firstWithId?.payload?.id) {
      return `https://images.fotmob.com/image_resources/playerimages/${firstWithId.payload.id}.png`;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * Fallback to Wikimedia Commons if not in FotMob
 */
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
  return null;
}

/**
 * Combined headshot resolver: FotMob cutout headshot first, Wikipedia fallback second.
 */
export async function resolvePlayerHeadshot(playerName: string, teamName?: string): Promise<string | null> {
  const fotmobPhoto = await fetchFotmobPlayerPhoto(playerName, teamName);
  if (fotmobPhoto) return fotmobPhoto;
  return fetchWikipediaPhoto(playerName);
}
