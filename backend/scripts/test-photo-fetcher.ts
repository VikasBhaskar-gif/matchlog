async function fetchPlayerPhoto(name: string): Promise<string | null> {
  // 1. Direct pageimages
  const queries = [name, `${name} (footballer)`];
  for (const q of queries) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(q)}&prop=pageimages&format=json&pithumbsize=200&redirects=1`;
    try {
      const res = await fetch(url);
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

async function main() {
  const names = ["Anthony Gordon", "Joan García", "Gerard Martín", "João Cancelo", "Xavi Espart", "Rodri", "Fermín López"];
  for (const n of names) {
    const photo = await fetchPlayerPhoto(n);
    console.log(`${n}: ${photo}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
