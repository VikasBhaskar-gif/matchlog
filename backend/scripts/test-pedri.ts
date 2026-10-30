async function main() {
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=Pedri&prop=pageimages&format=json&pithumbsize=200&pilicense=any&redirects=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "MatchlogApp/1.0 (https://matchlog.app; contact@matchlog.app)",
    },
  });
  console.log("Status:", res.status);
  const data = await res.json();
  const pages = data.query?.pages ?? {};
  const page: any = Object.values(pages)[0];
  console.log("Title:", page.title);
  console.log("Thumbnail:", page.thumbnail?.source);
}

main().catch(console.error).finally(() => process.exit(0));
