async function main() {
  const eventIds = ["401882832", "401879256", "401874958", "401915408"];
  for (const id of eventIds) {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${id}`);
    const data = await res.json();
    for (const r of data.rosters ?? []) {
      console.log(`\n=================== ${r.team?.displayName} (${r.formation}) ===================`);
      const starters = (r.roster ?? []).filter((p: any) => p.starter);
      starters
        .sort((a: any, b: any) => parseInt(a.formationPlace || "0", 10) - parseInt(b.formationPlace || "0", 10))
        .forEach((p: any) => {
          console.log(`  Place ${p.formationPlace}: ${p.athlete?.displayName} | abbr: ${p.position?.abbreviation} | name: ${p.position?.displayName}`);
        });
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
