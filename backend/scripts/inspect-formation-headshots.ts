async function main() {
  // Let's check Barcelona vs Real Madrid or PSG vs Barcelona
  const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/summary?event=401915408"); // or search for a game
  // Let's search scoreboard for Barcelona on Oct 20 or Oct 24
  const sres = await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20261025");
  const sdata = await sres.json();
  const ev = sdata.events?.find((e: any) => e.name?.includes("Barcelona") || e.name?.includes("Real Madrid"));
  console.log("Found event:", ev?.name, ev?.id);

  if (ev) {
    const sumRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=${ev.id}`);
    const sumData = await sumRes.json();
    for (const r of sumData.rosters ?? []) {
      console.log(`\n================= ${r.team?.displayName} =================`);
      console.log(`Formation: ${r.formation}`);
      for (const p of r.roster?.slice(0, 11) ?? []) {
        console.log({
          name: p.athlete?.displayName,
          id: p.athlete?.id,
          posName: p.position?.name,
          posDisplay: p.position?.displayName,
          posAbbr: p.position?.abbreviation,
          formationPlace: p.formationPlace,
          headshot: p.athlete?.headshot,
          links: p.athlete?.links,
        });
      }
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
