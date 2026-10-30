import { db } from "./db/client.js";
import { players } from "./db/schema/index.js";
import { isNotNull } from "drizzle-orm";

async function main() {
  const withPhotos = await db.select({ id: players.id, name: players.name, photoUrl: players.photoUrl }).from(players).where(isNotNull(players.photoUrl));
  const domains: Record<string, number> = {};
  const wikimediaPlayers: { id: string; name: string; url: string }[] = [];

  for (const p of withPhotos) {
    if (!p.photoUrl) continue;
    try {
      const url = new URL(p.photoUrl);
      domains[url.hostname] = (domains[url.hostname] || 0) + 1;
      if (url.hostname.includes("wikimedia") || url.hostname.includes("wikipedia")) {
        wikimediaPlayers.push({ id: p.id, name: p.name, url: p.photoUrl });
      }
    } catch {}
  }

  console.log("Photo domains:", domains);
  console.log("Wikimedia count:", wikimediaPlayers.length);
  console.log("Wikimedia sample:", wikimediaPlayers.slice(0, 5));
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
