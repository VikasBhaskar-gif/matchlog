async function main() {
  const names = ["Lamine Yamal", "Raphinha", "Pedri", "Kylian Mbappé", "Jude Bellingham", "Anthony Gordon", "Pau Cubarsí"];
  for (const name of names) {
    const encoded = encodeURIComponent(name);
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=pageimages&format=json&pithumbsize=200&redirects=1`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const pages = data.query?.pages ?? {};
      const page: any = Object.values(pages)[0];
      const source = page?.thumbnail?.source;
      console.log(`Wikipedia image for ${name}: ${source}`);
    } catch (e: any) {
      console.log(`Failed for ${name}:`, e.message);
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
