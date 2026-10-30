async function test() {
  const q = "Raphinha";
  const urls = [
    `https://www.fotmob.com/api/search/all?q=${encodeURIComponent(q)}`,
    `https://www.fotmob.com/api/search/suggest?term=${encodeURIComponent(q)}`,
    `https://apigw.fotmob.com/searchapi/suggest?term=${encodeURIComponent(q)}`,
    `https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(q)}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
      });
      console.log(url, "=> status:", res.status);
      if (res.ok) {
        const text = await res.text();
        console.log("Response snippet:", text.slice(0, 200));
      }
    } catch (e: any) {
      console.log(url, "=> error:", e.message);
    }
  }
}

test().catch(console.error).finally(() => process.exit(0));
