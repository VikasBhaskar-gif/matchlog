async function main() {
  const athleteIds = [
    { name: "Lamine Yamal", id: "362150" },
    { name: "Raphinha", id: "231050" },
    { name: "Pedri", id: "250465" },
    { name: "Kylian Mbappé", id: "231388" },
    { name: "Jude Bellingham", id: "291281" },
    { name: "Erling Haaland", id: "249852" },
  ];

  const urlTemplates = [
    (id: string) => `https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png`,
    (id: string) => `https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/${id}.png&w=96&h=96`,
    (id: string) => `https://a.espncdn.com/i/headshots/soccer/players/500/${id}.png`,
    (id: string) => `https://a.espncdn.com/combiner/i?img=/i/headshots/soccer/players/full/${id}.png&w=120&h=120&scale=crop`,
    (id: string) => `https://cdn.sofifa.net/players/...`
  ];

  for (const a of athleteIds) {
    console.log(`\nTesting ${a.name} (${a.id}):`);
    for (let i = 0; i < urlTemplates.length; i++) {
      const url = urlTemplates[i](a.id);
      try {
        const res = await fetch(url, { method: "HEAD" });
        console.log(`  Template ${i} (${res.status}): ${url}`);
        if (res.ok) {
          console.log(`  -> Content-Type: ${res.headers.get("content-type")}, Content-Length: ${res.headers.get("content-length")}`);
        }
      } catch (e: any) {
        console.log(`  Template ${i} failed:`, e.message);
      }
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
