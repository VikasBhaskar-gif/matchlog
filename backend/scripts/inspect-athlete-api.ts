async function main() {
  const endpoints = [
    "https://site.api.espn.com/apis/common/v3/sports/soccer/athletes/362150",
    "https://sports.core.api.espn.com/v2/sports/soccer/leagues/esp.1/athletes/362150",
    "https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/362150",
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      console.log(`Endpoint (${res.status}): ${url}`);
      if (res.ok) {
        const d = await res.json();
        console.log("Keys:", Object.keys(d));
        if (d.athlete) {
          console.log("athlete.headshot:", d.athlete.headshot);
        }
        if (d.headshot) {
          console.log("headshot:", d.headshot);
        }
      }
    } catch (e: any) {
      console.log("Error:", e.message);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
