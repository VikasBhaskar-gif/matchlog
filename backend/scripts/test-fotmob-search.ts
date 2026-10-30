async function searchPlayer(name: string) {
  const url = `https://apigw.fotmob.com/searchapi/suggest?term=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const suggestions = data.squadMemberSuggest?.[0]?.options ?? [];
  console.log(`\nSearch "${name}":`);
  for (const opt of suggestions.slice(0, 3)) {
    console.log("  text:", opt.text, "payload:", opt.payload);
  }
}

async function main() {
  await searchPlayer("Fermín López");
  await searchPlayer("Rodri");
  await searchPlayer("João Cancelo");
}

main().catch(console.error).finally(() => process.exit(0));
