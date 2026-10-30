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
